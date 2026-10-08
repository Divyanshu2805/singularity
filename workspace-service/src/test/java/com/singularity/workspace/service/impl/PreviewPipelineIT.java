package com.singularity.workspace.service.impl;

import com.singularity.common.dto.FileChangeDto;
import com.singularity.common.dto.PlanDto;
import com.singularity.common.dto.PublishRevisionRequest;
import com.singularity.common.dto.PublishRevisionResponse;
import com.singularity.common.feign.AccountServiceClient;
import com.singularity.common.security.AuthUtil;
import com.singularity.common.util.WindowsTimezoneWorkaround;
import com.singularity.workspace.config.InstanceId;
import com.singularity.workspace.config.KubernetesConfig;
import com.singularity.workspace.config.PreviewProperties;
import com.singularity.workspace.config.StorageConfig;
import com.singularity.workspace.dto.deploy.PreviewLogsResponse;
import com.singularity.workspace.dto.deploy.PreviewResponse;
import com.singularity.workspace.entity.Preview;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.enums.PreviewFailureKind;
import com.singularity.workspace.enums.PreviewStatus;
import com.singularity.workspace.enums.PreviewSyncState;
import com.singularity.workspace.repository.PreviewRepository;
import com.singularity.workspace.repository.PreviewSessionRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.util.PreviewAccessToken;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.Secret;
import io.fabric8.kubernetes.client.Config;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientBuilder;
import io.fabric8.kubernetes.client.LocalPortForward;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * A real preview, start to finish, on a real cluster: the starter template's files in a real MinIO, a real warm
 * runner pod claimed, a real npm install and Vite dev server, a real route in Redis, and the page fetched through the
 * real proxy. The pipeline was verified only by hand before this; nothing in the ordinary suite can prove any of it,
 * because every one of those things is mocked there.
 *
 * <p>Handles, in order on one project: a first start serving the app with the proxy's reporter in the page, and
 * serving it whole again to a browser that asks whether its cached copy is still good - a cached page carries the
 * reporter it was cached with, which is how a browser once went on running an old one; a link
 * that has run out, was tampered with or is missing being refused; an edit published as a revision reaching the
 * runner without a restart and the preview saying it is up to date with it; code that does not compile being served
 * as an error by a preview that is still up; a new package being installed by the server itself, on the same pod; a
 * runner that dies being noticed the moment its owner asks; a start with no runner free waiting in line and starting
 * by itself when one appears; Stop releasing the pod and the route; and a package that does not exist failing in one
 * plain sentence with its cause and the install's output.
 *
 * <p>It is not part of the suite - its name keeps the build from picking it up - because it needs a kind cluster
 * prepared by {@code k8s/preview-test-cluster.sh}, which gives it a namespace of its own. That matters: a
 * workspace-service running against the same namespace would release this test's pods as orphans, since its
 * database has never heard of them. CI runs both (job {@code preview-pipeline}); locally:
 *
 * <pre>
 * k8s/preview-test-cluster.sh --context kind-singularity
 * ./mvnw -pl common-lib,workspace-service test -Dtest=PreviewPipelineIT -Dsurefire.failIfNoSpecifiedTests=false
 * </pre>
 *
 * <p>The cluster is reached by name ({@code -Dpreview.it.context}, {@code -Dpreview.it.namespace} inside
 * {@code argLine}), never through whichever context kubectl points at. Redis, MinIO and the proxy are reached
 * through port-forwards this test opens itself, on ports the system picks, and the two secrets it needs - the
 * token-signing secret and MinIO's root credentials - are read back from the namespace, so nothing has to be passed
 * in or written down.
 *
 * <p>A {@code @DataJpaTest} slice over a throwaway Postgres, with the real preview and revision classes imported
 * and {@code @EnableAsync} switched on, so a start returns at once and comes up in the background, and a published
 * revision is applied off the publishing thread - as they are in the running service. Each step then waits for the
 * row to settle. Run on the calling thread instead, a start would not return until the preview was up, and the
 * session the caller's own view of it hangs off would not exist until then: the very first version of this test
 * could not see its own place in the line for that reason. The reaper is deliberately not here: nothing in this
 * test waits a minute for a sweep, and each thing the reaper would have done is asked for directly.
 *
 * <p>The entry point is built by hand around the two stand-ins it needs - who is signed in, and their plan - rather
 * than left to Spring to wire. The application's own {@code @EnableFeignClients} registers a real client for the
 * account service, and asking Spring for that type by injection resolves the real one too, which needs Feign
 * infrastructure this slice does not load (docs/practices/gotchas/spring-and-jpa.md).
 *
 * <p>One instance runs every step, since the steps share a preview, and with that lifecycle the Spring context is
 * built before the container extension has started anything - so the database is started by hand where the
 * properties are registered, which is the first thing to run.
 *
 * <p>The page is fetched over a plain socket with the Host header written by hand. The proxy routes on Host, and no
 * HTTP client in the JDK will send one that differs from the address it connects to; resolving
 * {@code *.localhost} is left to the operating system and is not the same everywhere.
 *
 * <p>How long each start took is printed and written to {@code target/preview-timings.txt}: a first start, a
 * restart on a pod that already has its packages, and a start from a fresh pod. Those are the numbers
 * docs/deployment/capacity.md asks to be re-measured.
 */
@DataJpaTest(properties = {
        "spring.flyway.locations=classpath:db/migration",
        "spring.jpa.hibernate.ddl-auto=validate",
        "preview.queue-timeout=6m",
        "preview.boot-timeout=5m"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@EntityScan("com.singularity.workspace.entity")
@EnableJpaRepositories("com.singularity.workspace.repository")
@Import({KubernetesConfig.class, StorageConfig.class, InstanceId.class, PreviewRunnerPool.class, PreviewRouter.class,
        PreviewLifecycle.class, PreviewBootstrapper.class, PreviewSynchronizer.class,
        RevisionManifestStore.class, BlobStoreImpl.class, RevisionPublisherImpl.class, PreviewPipelineIT.TestBeans.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PreviewPipelineIT {

    private static final String CONTEXT = System.getProperty("preview.it.context", "kind-singularity");
    private static final String NAMESPACE = System.getProperty("preview.it.namespace", "singularity-it");
    private static final String TEMPLATE = "starter-templates/react-vite-tailwind-shadcn-starter/";
    private static final long USER_ID = 7L;
    private static final String MARKER = "Edited by PreviewPipelineIT";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private static KubernetesClient cluster;
    private static LocalPortForward redisForward;
    private static LocalPortForward minioForward;
    private static LocalPortForward proxyForward;
    private static String tokenSecret;
    private static final Map<String, Double> TIMINGS = new LinkedHashMap<>();

    @Autowired
    private PreviewDeploymentServiceImpl service;
    @Autowired
    private PreviewRunnerPool runnerPool;
    @Autowired
    private PreviewRepository previewRepository;
    @Autowired
    private ProjectRepository projectRepository;
    @Autowired
    private RevisionPublisherImpl publisher;
    @Autowired
    private StringRedisTemplate redis;
    @Autowired
    private MinioClient minioClient;
    @Autowired
    private PreviewProperties properties;
    @Autowired
    private PlatformTransactionManager transactionManager;

    private Long projectId;
    private String packageJson;
    private String appTsx;

    @DynamicPropertySource
    static void connect(DynamicPropertyRegistry registry) {
        WindowsTimezoneWorkaround.apply();
        POSTGRES.start();
        cluster = new KubernetesClientBuilder().withConfig(Config.autoConfigure(CONTEXT)).build();
        redisForward = forward("redis", 6379);
        minioForward = forward("minio", 9000);
        proxyForward = forward("singularity-proxy", 8080);
        tokenSecret = secret("preview-access-token", "secret");

        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("preview.kube-context", () -> CONTEXT);
        registry.add("preview.namespace", () -> NAMESPACE);
        registry.add("preview.access-token-secret", () -> tokenSecret);
        registry.add("minio.url", () -> "http://127.0.0.1:" + minioForward.getLocalPort());
        registry.add("minio.access-key", () -> secret("minio-root-credentials", "username"));
        registry.add("minio.secret-key", () -> secret("minio-root-credentials", "password"));
        registry.add("preview.it.redis-port", () -> redisForward.getLocalPort());
    }

    private static LocalPortForward forward(String app, int port) {
        Pod pod = cluster.pods().inNamespace(NAMESPACE).withLabel("app", app).list().getItems().stream()
                .filter(candidate -> "Running".equals(candidate.getStatus().getPhase())
                        && candidate.getMetadata().getDeletionTimestamp() == null)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("No running '" + app + "' pod in namespace " + NAMESPACE
                        + " of " + CONTEXT + ". Run k8s/preview-test-cluster.sh --context " + CONTEXT + " first."));
        return cluster.pods().inNamespace(NAMESPACE).withName(pod.getMetadata().getName())
                .portForward(port, InetAddress.getLoopbackAddress(), 0);
    }

    private static String secret(String name, String key) {
        Secret found = cluster.secrets().inNamespace(NAMESPACE).withName(name).get();
        if (found == null) throw new IllegalStateException("Secret " + name + " is missing from namespace " + NAMESPACE);
        return new String(Base64.getDecoder().decode(found.getData().get(key)), StandardCharsets.UTF_8);
    }

    @EnableAsync
    @EnableConfigurationProperties(PreviewProperties.class)
    static class TestBeans {

        @Bean
        LettuceConnectionFactory redisConnectionFactory(
                @org.springframework.beans.factory.annotation.Value("${preview.it.redis-port}") int port) {
            return new LettuceConnectionFactory(new RedisStandaloneConfiguration("127.0.0.1", port));
        }

        @Bean
        StringRedisTemplate stringRedisTemplate(LettuceConnectionFactory factory) {
            return new StringRedisTemplate(factory);
        }

        private final AuthUtil authUtil = mock(AuthUtil.class);
        private final AccountServiceClient accountServiceClient = mock(AccountServiceClient.class);

        @Bean
        PreviewDeploymentServiceImpl previewDeploymentService(
                PreviewRepository previewRepository, PreviewSessionRepository sessionRepository,
                ProjectRepository projectRepository, PreviewRunnerPool runnerPool, PreviewRouter router,
                PreviewBootstrapper bootstrapper, PreviewLifecycle lifecycle, PreviewProperties properties) {
            when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
            when(accountServiceClient.getPlanLimits(anyLong())).thenReturn(new PlanDto(1L, "Test", 10, 1_000_000, 3, false));
            return new PreviewDeploymentServiceImpl(previewRepository, sessionRepository, projectRepository, runnerPool,
                    router, bootstrapper, lifecycle, properties, accountServiceClient, authUtil);
        }
    }

    @BeforeAll
    void seedAProjectFromTheStarterTemplate() throws Exception {
        for (String bucket : List.of("projects", "project-blobs")) {
            if (!minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
            }
        }
        projectId = projectRepository.save(Project.builder().name("preview-pipeline-it").build()).getId();

        int uploaded = 0;
        for (Resource file : new PathMatchingResourcePatternResolver().getResources("classpath:" + TEMPLATE + "**")) {
            if (!file.isReadable()) continue;
            String url = file.getURL().toString();
            String path = url.substring(url.indexOf(TEMPLATE) + TEMPLATE.length());
            if (path.isBlank() || path.equals("MANIFEST.txt")) continue;
            byte[] bytes;
            try (InputStream in = file.getInputStream()) {
                bytes = in.readAllBytes();
            }
            if (path.equals("package.json")) packageJson = new String(bytes, StandardCharsets.UTF_8);
            if (path.equals("src/App.tsx")) appTsx = new String(bytes, StandardCharsets.UTF_8);
            minioClient.putObject(PutObjectArgs.builder().bucket("projects").object(projectId + "/" + path)
                    .stream(new ByteArrayInputStream(bytes), bytes.length, -1).build());
            uploaded++;
        }
        assertThat(uploaded).as("starter template files uploaded").isGreaterThan(20);
        assertThat(packageJson).isNotNull();
        assertThat(appTsx).isNotNull();
    }

    @AfterAll
    void leaveNothingRunning() throws IOException {
        try {
            if (projectId != null) service.stopAllForProject(projectId, "PreviewPipelineIT finished");
            scaleRunnerPool(2);
        } finally {
            StringBuilder report = new StringBuilder();
            TIMINGS.forEach((what, seconds) -> report.append(String.format("%-52s %6.1f s%n", what, seconds)));
            System.out.println("\n[preview-timings]\n" + report);
            Files.writeString(Path.of("target", "preview-timings.txt"), report.toString());
            for (LocalPortForward forward : List.of(redisForward, minioForward, proxyForward)) forward.close();
            cluster.close();
        }
    }

    @Test
    @Order(1)
    void aFirstStartServesTheAppThroughTheProxy() throws Exception {
        PreviewResponse started = timed("first start, fresh pod", () -> {
            PreviewResponse response = service.startPreview(projectId);
            settled();
            return response;
        });

        Preview runner = runner();
        assertThat(runner.getStatus()).as("status, detail: %s\n%s", runner.getDetail(), runner.getFailureLog())
                .isEqualTo(PreviewStatus.RUNNING);
        assertThat(started.previewUrl()).contains("?pvt=");
        assertThat(redis.opsForValue().get("route:" + runner.getHostname())).endsWith(":" + properties.runnerPort());
        assertThat(cluster.pods().inNamespace(NAMESPACE).withName(runner.getPodName()).get().getMetadata().getLabels())
                .containsEntry("status", "busy").containsEntry("project-id", projectId.toString());

        Response exchange = get(runner.getHostname(), "/?pvt=" + freshToken(runner.getHostname()), null, "text/html");
        assertThat(exchange.status()).isEqualTo(302);
        assertThat(exchange.header("location")).isEqualTo("/");
        String cookie = cookie(runner.getHostname());

        Response page = get(runner.getHostname(), "/", cookie, "text/html");
        assertThat(page.status()).isEqualTo(200);
        assertThat(page.body()).contains("id=\"root\"").contains("PreviewReady").contains("PreviewConsole");
        assertThat(page.header("cache-control")).isEqualTo("no-store");
        assertThat(page.header("etag")).isNull();

        Response revalidated = get(runner.getHostname(), "/", cookie, "text/html",
                "If-None-Match: *", "If-Modified-Since: Fri, 01 Jan 2100 00:00:00 GMT");
        assertThat(revalidated.status()).as("a page load is never answered 'not modified'").isEqualTo(200);
        assertThat(revalidated.body()).contains("PreviewReady");

        Response module = get(runner.getHostname(), "/src/main.tsx", cookie, "*/*");
        assertThat(module.status()).isEqualTo(200);
        assertThat(module.body()).contains("createRoot");
    }

    @Test
    @Order(2)
    void aLinkThatHasRunOutWasTamperedWithOrIsMissingIsRefused() throws Exception {
        String hostname = runner().getHostname();
        String expired = PreviewAccessToken.mint(tokenSecret, hostname, Instant.now().minus(Duration.ofHours(7)), Duration.ofHours(6));
        String forged = PreviewAccessToken.mint("not-the-secret", hostname, Instant.now(), Duration.ofHours(6));
        String forAnotherPreview = PreviewAccessToken.mint(tokenSecret, "p999-zzzzzzzzzz.localhost", Instant.now(), Duration.ofHours(6));

        for (String token : List.of(expired, forged, forAnotherPreview)) {
            Response refused = get(hostname, "/?pvt=" + token, null, "text/html");
            assertThat(refused.status()).isEqualTo(401);
            assertThat(refused.body()).contains("PreviewStatusPage").contains("status: 401");
        }
        assertThat(get(hostname, "/", null, "text/html").status()).isEqualTo(401);
        assertThat(get(hostname, "/", "pv_auth=" + expired, "text/html").status()).isEqualTo(401);
        assertThat(get(hostname, "/src/main.tsx", null, "*/*").status()).isEqualTo(401);
    }

    @Test
    @Order(3)
    void anEditReachesTheRunnerWithoutARestartAndThePreviewSaysItIsUpToDate() throws Exception {
        Preview before = runner();

        Long revision = publish(new FileChangeDto("src/App.tsx", FileChangeDto.ChangeType.EDIT,
                appTsx + "\nexport const marker = \"" + MARKER + "\";\n"));

        Preview after = levelWith(revision);
        assertThat(after.getId()).isEqualTo(before.getId());
        assertThat(after.getPodName()).isEqualTo(before.getPodName());
        assertThat(after.getStatus()).isEqualTo(PreviewStatus.RUNNING);
        assertThat(after.getSyncedRevisionId()).isEqualTo(revision);
        assertThat(after.getReadyAt()).as("no restart happened").isEqualTo(before.getReadyAt());
        assertThat(myPreview().syncState()).isEqualTo(PreviewSyncState.UP_TO_DATE);

        String cookie = cookie(after.getHostname());
        assertThat(eventually(Duration.ofSeconds(20), () -> get(after.getHostname(), "/src/App.tsx", cookie, "*/*").body(),
                body -> body.contains(MARKER))).contains(MARKER);
    }

    @Test
    @Order(4)
    void codeThatDoesNotCompileIsServedAsAnErrorByAPreviewThatIsStillUp() throws Exception {
        Preview running = runner();
        String cookie = cookie(running.getHostname());

        levelWith(publish(new FileChangeDto("src/App.tsx", FileChangeDto.ChangeType.EDIT,
                "export default function App() {\n  return <div>oops;\n}\n")));

        Response broken = eventually(Duration.ofSeconds(20),
                () -> get(running.getHostname(), "/src/App.tsx", cookie, "*/*"), response -> response.status() == 500);
        assertThat(broken.status()).isEqualTo(500);
        assertThat(get(running.getHostname(), "/", cookie, "text/html").status()).isEqualTo(200);
        assertThat(runner().getStatus()).isEqualTo(PreviewStatus.RUNNING);

        levelWith(publish(new FileChangeDto("src/App.tsx", FileChangeDto.ChangeType.EDIT, appTsx)));

        Response mended = eventually(Duration.ofSeconds(20),
                () -> get(running.getHostname(), "/src/App.tsx", cookie, "*/*"), response -> response.status() == 200);
        assertThat(mended.status()).isEqualTo(200);
    }

    @Test
    @Order(5)
    void aNewPackageIsInstalledByTheServerItselfOnTheSamePod() throws Exception {
        Preview before = runner();

        Long revision = timed("reinstall after a new package, same pod", () -> {
            Long published = publish(new FileChangeDto("package.json", FileChangeDto.ChangeType.EDIT, withDependency("is-number", "7.0.0")));
            levelWith(published);
            return published;
        });

        Preview after = runner();
        assertThat(after.getStatus()).as("status, detail: %s\n%s", after.getDetail(), after.getFailureLog())
                .isEqualTo(PreviewStatus.RUNNING);
        assertThat(after.getId()).isEqualTo(before.getId());
        assertThat(after.getPodName()).isEqualTo(before.getPodName());
        assertThat(after.getHostname()).isEqualTo(before.getHostname());
        assertThat(after.getReadyAt()).as("the dev server was restarted").isAfter(before.getReadyAt());
        assertThat(after.getSyncedRevisionId()).isEqualTo(revision);
        assertThat(runnerPool.exec(after.getPodName(), PreviewRunnerPool.RUNNER_CONTAINER, Duration.ofSeconds(20),
                "test -d /app/node_modules/is-number").succeeded()).isTrue();
        assertThat(get(after.getHostname(), "/", cookie(after.getHostname()), "text/html").status()).isEqualTo(200);
    }

    @Test
    @Order(6)
    void aRunnerThatDiesIsNoticedTheMomentItsOwnerAsks() throws Exception {
        Preview running = runner();
        cluster.pods().inNamespace(NAMESPACE).withName(running.getPodName()).withGracePeriod(0).delete();
        eventually(Duration.ofSeconds(60), () -> cluster.pods().inNamespace(NAMESPACE).withName(running.getPodName()).get(),
                pod -> pod == null || pod.getMetadata().getDeletionTimestamp() != null);

        PreviewResponse seen = myPreview();

        assertThat(seen.status()).isEqualTo(PreviewStatus.TERMINATED);
        assertThat(seen.detail()).isEqualTo(PreviewDeploymentServiceImpl.RUNNER_GONE);
        assertThat(redis.hasKey("route:" + running.getHostname())).isFalse();
        Response gone = get(running.getHostname(), "/", cookie(running.getHostname()), "text/html");
        assertThat(gone.status()).isEqualTo(404);
        assertThat(gone.body()).contains("isn&#39;t running").contains("status: 404");
    }

    @Test
    @Order(7)
    void aStartWithNoRunnerFreeWaitsInLineAndStartsByItselfWhenOneAppears() throws Exception {
        scaleRunnerPool(0);
        eventually(Duration.ofSeconds(60), this::idleRunners, idle -> idle == 0);

        long began = System.nanoTime();
        PreviewResponse answered = service.startPreview(projectId);
        assertThat(answered.status()).isEqualTo(PreviewStatus.CREATING);
        assertThat(answered.queuePosition()).isEqualTo(1);

        Thread.sleep(6_000);
        Preview waiting = runner();
        assertThat(waiting.getStatus()).as("still waiting after several turns at the front of the line").isEqualTo(PreviewStatus.CREATING);
        assertThat(waiting.getPodName()).isNull();
        assertThat(waiting.getDetail()).isEqualTo("Waiting for a free runner");
        PreviewResponse inLine = myPreview();
        assertThat(inLine.status()).isEqualTo(PreviewStatus.CREATING);
        assertThat(inLine.queuePosition()).isEqualTo(1);
        assertThat(inTransaction(() -> service.getPreviewLogs(projectId)).log()).startsWith("Waiting for a free runner");

        scaleRunnerPool(2);
        settled();
        TIMINGS.put("start from the line, fresh pod (includes the wait)", (System.nanoTime() - began) / 1e9);

        Preview running = runner();
        assertThat(running.getStatus()).as("status, detail: %s\n%s", running.getDetail(), running.getFailureLog())
                .isEqualTo(PreviewStatus.RUNNING);
        assertThat(running.getPodName()).isNotNull();
        assertThat(myPreview().queuePosition()).isNull();
        assertThat(get(running.getHostname(), "/", cookie(running.getHostname()), "text/html").status()).isEqualTo(200);
    }

    @Test
    @Order(8)
    void stopReleasesThePodAndTheRoute() throws Exception {
        Preview running = runner();

        service.stopPreview(projectId);

        assertThat(runner().getStatus()).isEqualTo(PreviewStatus.TERMINATED);
        assertThat(redis.hasKey("route:" + running.getHostname())).isFalse();
        Pod pod = eventually(Duration.ofSeconds(60), () -> cluster.pods().inNamespace(NAMESPACE).withName(running.getPodName()).get(),
                found -> found == null || found.getMetadata().getDeletionTimestamp() != null);
        assertThat(pod == null || pod.getMetadata().getDeletionTimestamp() != null).isTrue();
        PreviewResponse mine = myPreview();
        assertThat(mine.status()).isEqualTo(PreviewStatus.TERMINATED);
        assertThat(mine.detail()).isEqualTo("Stopped");
        assertThat(get(running.getHostname(), "/", cookie(running.getHostname()), "text/html").status()).isEqualTo(404);
    }

    @Test
    @Order(9)
    void aPackageThatDoesNotExistFailsInOnePlainSentenceWithItsCauseAndTheOutput() throws Exception {
        String missing = "singularity-preview-it-no-such-package";
        publish(new FileChangeDto("package.json", FileChangeDto.ChangeType.EDIT, withDependency(missing, "1.0.0")));

        timed("start that fails at install", () -> {
            service.startPreview(projectId);
            return settled();
        });

        Preview failed = runner();
        assertThat(failed.getStatus()).isEqualTo(PreviewStatus.FAILED);
        assertThat(failed.getFailureKind()).isEqualTo(PreviewFailureKind.INSTALL);
        assertThat(failed.getDetail()).isEqualTo("The package \"" + missing + "\" doesn't exist on npm - check its name in package.json.");
        assertThat(failed.getFailureLog()).contains("E404");
        PreviewResponse mine = myPreview();
        assertThat(mine.status()).isEqualTo(PreviewStatus.FAILED);
        assertThat(mine.failureKind()).isEqualTo(PreviewFailureKind.INSTALL);
        PreviewLogsResponse logs = inTransaction(() -> service.getPreviewLogs(projectId));
        assertThat(logs.live()).isFalse();
        assertThat(logs.log()).contains(missing);
        assertThat(redis.hasKey("route:" + failed.getHostname())).isFalse();
    }

    private Preview runner() {
        return previewRepository.findAll().stream()
                .filter(preview -> projectId.equals(preview.getProjectId()))
                .max((a, b) -> Long.compare(a.getId(), b.getId()))
                .orElseThrow(() -> new AssertionError("No preview row for project " + projectId));
    }

    private Preview settled() {
        try {
            return eventually(Duration.ofMinutes(9), this::runner, row -> row.getStatus() != PreviewStatus.CREATING);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private Preview levelWith(Long revision) {
        Preview level;
        try {
            level = eventually(Duration.ofMinutes(6), this::runner, row -> row.getStatus() != PreviewStatus.CREATING
                    && (row.getStatus() != PreviewStatus.RUNNING || revision.equals(row.getSyncedRevisionId())));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        assertThat(level.getStatus()).as("status, detail: %s\n%s", level.getDetail(), level.getFailureLog())
                .isEqualTo(PreviewStatus.RUNNING);
        assertThat(level.getSyncedRevisionId()).isEqualTo(revision);
        return level;
    }

    private PreviewResponse myPreview() {
        return inTransaction(() -> service.getPreview(projectId).orElseThrow());
    }

    private <T> T inTransaction(Supplier<T> work) {
        return new TransactionTemplate(transactionManager).execute(status -> work.get());
    }

    private Long publish(FileChangeDto change) {
        Long parent = projectRepository.findCurrentFileRevisionId(projectId).orElse(null);
        PublishRevisionResponse response = publisher.publish(projectId,
                new PublishRevisionRequest(parent, USER_ID, "MANUAL_EDIT", List.of(change)));
        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.APPLIED);
        return response.revisionId();
    }

    private String withDependency(String name, String version) {
        String anchor = "\"dependencies\": {";
        assertThat(packageJson).contains(anchor);
        return packageJson.replace(anchor, anchor + "\n    \"" + name + "\": \"" + version + "\",");
    }

    private int idleRunners() {
        return cluster.pods().inNamespace(NAMESPACE).withLabel("app", "runner").withLabel("status", "idle").list().getItems().size();
    }

    private void scaleRunnerPool(int replicas) {
        cluster.apps().deployments().inNamespace(NAMESPACE).withName("runner-pool").scale(replicas);
    }

    private String freshToken(String hostname) {
        return PreviewAccessToken.mint(tokenSecret, hostname, Instant.now(), Duration.ofHours(6));
    }

    private String cookie(String hostname) {
        return "pv_auth=" + freshToken(hostname);
    }

    private static <T> T timed(String what, Supplier<T> work) {
        long began = System.nanoTime();
        try {
            return work.get();
        } finally {
            TIMINGS.put(what, (System.nanoTime() - began) / 1e9);
        }
    }

    private interface Attempt<T> {
        T run() throws Exception;
    }

    private static <T> T eventually(Duration limit, Attempt<T> attempt, java.util.function.Predicate<T> done) throws Exception {
        Instant deadline = Instant.now().plus(limit);
        while (true) {
            T value = attempt.run();
            if (done.test(value) || Instant.now().isAfter(deadline)) return value;
            Thread.sleep(500);
        }
    }

    private record Response(int status, Map<String, String> headers, String body) {
        String header(String name) {
            return headers.get(name);
        }
    }

    private Response get(String hostname, String path, String cookie, String accept, String... extraHeaders) throws IOException {
        try (Socket socket = new Socket(InetAddress.getLoopbackAddress(), proxyForward.getLocalPort())) {
            socket.setSoTimeout(30_000);
            StringBuilder request = new StringBuilder("GET ").append(path).append(" HTTP/1.1\r\n")
                    .append("Host: ").append(hostname).append("\r\n")
                    .append("Accept: ").append(accept).append("\r\n")
                    .append("Connection: close\r\n");
            if (cookie != null) request.append("Cookie: ").append(cookie).append("\r\n");
            for (String header : extraHeaders) request.append(header).append("\r\n");
            request.append("\r\n");
            OutputStream out = socket.getOutputStream();
            out.write(request.toString().getBytes(StandardCharsets.ISO_8859_1));
            out.flush();

            ByteArrayOutputStream raw = new ByteArrayOutputStream();
            socket.getInputStream().transferTo(raw);
            String text = raw.toString(StandardCharsets.UTF_8);
            int split = text.indexOf("\r\n\r\n");
            String head = split < 0 ? text : text.substring(0, split);
            List<String> lines = new ArrayList<>(List.of(head.split("\r\n")));
            int status = Integer.parseInt(lines.remove(0).split(" ")[1]);
            Map<String, String> headers = new LinkedHashMap<>();
            for (String line : lines) {
                int colon = line.indexOf(':');
                if (colon > 0) headers.put(line.substring(0, colon).strip().toLowerCase(), line.substring(colon + 1).strip());
            }
            return new Response(status, headers, split < 0 ? "" : text.substring(split + 4));
        }
    }
}
