package com.vibecraft.intelligence.controller;

import com.vibecraft.intelligence.dto.usage.PlanLimitsResponse;
import com.vibecraft.intelligence.dto.usage.UsageTodayResponse;
import com.vibecraft.intelligence.dto.usage.UsageEventPage;
import com.vibecraft.intelligence.dto.usage.UsageInsightsResponse;
import com.vibecraft.intelligence.service.UsageInsightsService;
import com.vibecraft.intelligence.service.UsageService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.RequestParam;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Token usage and plan limits, for the browser.
 *
 * <p>Handles: today's usage against the plan's ceilings, the plan limits on their own, the insights breakdown for a
 * range, the paginated activity list, and the CSV export.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/usage")
public class UsageController {

    private final UsageService usageService;
    private final UsageInsightsService usageInsightsService;

    @GetMapping("/today")
    public ResponseEntity<UsageTodayResponse> getTodayUsage(@RequestParam(required = false) Long projectId) {
        return ResponseEntity.ok(usageService.getTodayUsageOfUser(projectId));
    }

    @GetMapping("/insights")
    public ResponseEntity<UsageInsightsResponse> getInsights(@RequestParam(defaultValue = "7d") String range) {
        return ResponseEntity.ok(usageInsightsService.getInsights(range));
    }

    @GetMapping("/events")
    public ResponseEntity<UsageEventPage> getEvents(@RequestParam(defaultValue = "0") int page,
                                                    @RequestParam(defaultValue = "25") int size) {
        return ResponseEntity.ok(usageInsightsService.getRecentEvents(page, size));
    }

    @GetMapping("/events/export")
    public ResponseEntity<byte[]> exportEvents(@RequestParam(defaultValue = "30d") String range) {
        byte[] body = usageInsightsService.exportCsv(range).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"vibecraft-usage-" + range + ".csv\"")
                .body(body);
    }

    @GetMapping("/limits")
    public ResponseEntity<PlanLimitsResponse> getPlanLimits() {
        return ResponseEntity.ok(usageService.getCurrentSubscriptionLimitsOfUser());
    }

}
