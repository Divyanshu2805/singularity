package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.dto.PlanDto;
import com.vibecraft.common.dto.ProjectSummaryDto;
import com.vibecraft.intelligence.dto.usage.UsageEventPage;
import com.vibecraft.intelligence.dto.usage.UsageEventResponse;
import com.vibecraft.intelligence.dto.usage.UsageInsightsResponse;
import com.vibecraft.intelligence.entity.UsageEvent;
import com.vibecraft.intelligence.entity.UsageLog;
import com.vibecraft.common.error.BadRequestException;
import com.vibecraft.intelligence.feign.AccountServiceClient;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.repository.UsageEventRepository;
import com.vibecraft.intelligence.repository.UsageLogRepository;
import com.vibecraft.intelligence.security.AuthUtil;
import com.vibecraft.intelligence.service.UsageInsightsService;
import com.vibecraft.intelligence.util.UsageInsightsAssembler;
import com.vibecraft.intelligence.util.UsageInsightsAssembler.ProjectInfo;
import com.vibecraft.intelligence.util.UsageInsightsAssembler.Row;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UsageInsightsServiceImpl implements UsageInsightsService {

    /** The widest window offered. Also the ceiling on how much history one request can make the database scan. */
    private static final Map<String, Integer> RANGE_DAYS = Map.of("7d", 7, "30d", 30, "90d", 90);
    private static final int MAX_PAGE_SIZE = 100;
    private static final DateTimeFormatter CSV_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final UsageEventRepository usageEventRepository;
    private final UsageLogRepository usageLogRepository;
    private final AccountServiceClient accountServiceClient;
    private final WorkspaceServiceClient workspaceServiceClient;
    private final AuthUtil authUtil;

    @Override
    public UsageInsightsResponse getInsights(String range) {
        Long userId = authUtil.getCurrentUserId();
        ZoneId zone = zone();
        LocalDate today = LocalDate.now(zone);
        PlanDto plan = accountServiceClient.getPlanLimits(userId);
        int limit = plan.maxTokensPerDay();
        String planName = plan.name();

        if ("today".equals(range)) {
            List<Row> rows = rows(usageEventRepository.aggregateByHour(userId, startOf(today, zone),
                    startOf(today.plusDays(1), zone), zone.getId()));
            long counted = usageLogRepository.findByUserIdAndDate(userId, today).map(UsageLog::getTokensUsed)
                    .map(Integer::longValue).orElse(0L);
            return UsageInsightsAssembler.hours(today, rows, counted, limit, planName, projects(rows));
        }

        Integer days = RANGE_DAYS.get(range);
        if (days == null) {
            throw new BadRequestException("Unknown range '" + range + "' - use today, 7d, 30d or 90d.");
        }
        LocalDate from = today.minusDays(days - 1L);
        List<Row> rows = rows(usageEventRepository.aggregateByDay(userId, startOf(from, zone),
                startOf(today.plusDays(1), zone), zone.getId()));
        Map<LocalDate, Long> counted = usageLogRepository.findByUserIdAndDateBetween(userId, from, today).stream()
                .collect(Collectors.toMap(UsageLog::getDate,
                        log -> log.getTokensUsed() == null ? 0L : log.getTokensUsed().longValue(), Long::sum));

        return UsageInsightsAssembler.days(range, from, today, rows, counted, limit, planName, projects(rows));
    }

    @Override
    public UsageEventPage getRecentEvents(int page, int size) {
        Long userId = authUtil.getCurrentUserId();
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(1, size), MAX_PAGE_SIZE);

        // One extra row tells us whether there is a next page without a separate count query.
        List<UsageEvent> events = usageEventRepository.findByUserIdOrderByCreatedAtDescIdDesc(
                userId, PageRequest.of(safePage, safeSize + 1));
        boolean hasMore = events.size() > safeSize;
        List<UsageEvent> visible = hasMore ? events.subList(0, safeSize) : events;

        Map<Long, ProjectInfo> names = projectInfo(visible.stream().map(UsageEvent::getProjectId).collect(Collectors.toSet()));
        return new UsageEventPage(visible.stream().map(event -> toResponse(event, names)).toList(), safePage, safeSize, hasMore);
    }

    @Override
    public String exportCsv(String range) {
        Long userId = authUtil.getCurrentUserId();
        ZoneId zone = zone();
        LocalDate today = LocalDate.now(zone);
        int days = "today".equals(range) ? 1 : RANGE_DAYS.getOrDefault(range, -1);
        if (days < 0) {
            throw new BadRequestException("Unknown range '" + range + "' - use today, 7d, 30d or 90d.");
        }

        List<UsageEvent> events = usageEventRepository
                .findByUserIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
                        userId, startOf(today.minusDays(days - 1L), zone), startOf(today.plusDays(1), zone));
        Map<Long, ProjectInfo> names = projectInfo(events.stream().map(UsageEvent::getProjectId).collect(Collectors.toSet()));

        StringBuilder csv = new StringBuilder("time,project,feature,input_tokens,output_tokens,total_tokens\n");
        for (UsageEvent event : events) {
            ProjectInfo info = event.getProjectId() == null ? null : names.get(event.getProjectId());
            csv.append(CSV_TIME.format(event.getCreatedAt().atZone(zone))).append(',')
                    .append(csvCell(info == null ? "" : info.name())).append(',')
                    .append(event.getFeature()).append(',')
                    .append(event.getInputTokens()).append(',')
                    .append(event.getOutputTokens()).append(',')
                    .append(event.getTotalTokens()).append('\n');
        }
        return csv.toString();
    }

    /**
     * A project name is user-written, so it is quoted and its quotes doubled (RFC 4180), and a leading
     * {@code = + - @} is neutralised - otherwise a project named {@code =HYPERLINK(...)} becomes a live formula
     * the moment the export is opened in a spreadsheet.
     */
    static String csvCell(String value) {
        String text = value == null ? "" : value;
        if (!text.isEmpty() && "=+-@".indexOf(text.charAt(0)) >= 0) {
            text = "'" + text;
        }
        return "\"" + text.replace("\"", "\"\"") + "\"";
    }

    private UsageEventResponse toResponse(UsageEvent event, Map<Long, ProjectInfo> names) {
        ProjectInfo info = event.getProjectId() == null ? null : names.get(event.getProjectId());
        return new UsageEventResponse(event.getId(), event.getCreatedAt(), event.getProjectId(),
                info == null ? null : info.name(), event.getFeature(),
                event.getInputTokens(), event.getOutputTokens(), event.getTotalTokens());
    }

    private Map<Long, ProjectInfo> projects(List<Row> rows) {
        return projectInfo(rows.stream().map(Row::projectId).filter(Objects::nonNull).collect(Collectors.toSet()));
    }

    /**
     * Names for the projects the caller spent tokens on. Looked up by id with no membership check: every id here
     * came from the caller's own ledger rows, so it's a project they used - including one since deleted, or one
     * they have since been removed from, whose tokens they still spent.
     */
    private Map<Long, ProjectInfo> projectInfo(Set<Long> ids) {
        Set<Long> wanted = new HashSet<>(ids);
        wanted.remove(null);
        Map<Long, ProjectInfo> info = new HashMap<>();
        if (wanted.isEmpty()) return info;
        // One batch call, not one per project - a 90-day CSV export can plausibly span dozens of distinct
        // projects, unlike workspace-service's own small-member-list N+1 which is bounded by real headcount.
        for (ProjectSummaryDto project : workspaceServiceClient.getProjectSummaries(List.copyOf(wanted))) {
            info.put(project.id(), new ProjectInfo(project.name(), project.deleted()));
        }
        return info;
    }

    private static List<Row> rows(List<Object[]> raw) {
        return raw.stream().map(r -> new Row(
                String.valueOf(r[0]),
                String.valueOf(r[1]),
                r[2] == null ? null : ((Number) r[2]).longValue(),
                ((Number) r[3]).longValue(),
                ((Number) r[4]).longValue(),
                ((Number) r[5]).longValue(),
                ((Number) r[6]).longValue())).toList();
    }

    /** The zone the daily quota counter rolls over in - see {@code UsageServiceImpl.dailyResetInstant}. */
    private static ZoneId zone() {
        return ZoneId.systemDefault();
    }

    private static Instant startOf(LocalDate day, ZoneId zone) {
        return day.atStartOfDay(zone).toInstant();
    }
}
