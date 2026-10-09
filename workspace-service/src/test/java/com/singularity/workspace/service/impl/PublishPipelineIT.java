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
import com.singularity.workspace.config.ProjectFileLimits;
import com.singularity.workspace.config.PublishingProperties;
import com.singularity.workspace.config.StorageConfig;
import com.singularity.workspace.dto.publish.PublishRequest;
import com.singularity.workspace.dto.publish.PublishResponse;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.PublishedApp;
import com.singularity.workspace.enums.PublishBuildStatus;
import com.singularity.workspace.enums.PublishFailureKind;
import com.singularity.workspace.enums.PublishStatus;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.repository.PublishedAppRepository;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.Secret;
import io.fabric8.kubernetes.client.Config;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientBuilder;
import io.fabric8.kubernetes.client.LocalPortForward;
import io.minio.BucketExistsArgs;
import io.minio.ListObjectsArgs;
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
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * A real publish, start to finish, on a real cluster: the starter template's files in a real MinIO, a real warm runner
 * pod claimed for the build, a real {@code npm install} and {@code vite build}, the build taken back out as a tar and
 * stored, a pointer written, and the app fetched through the real proxy at its own hostname. As with
 * {@link PreviewPipelineIT}, nothing in the ordinary suite can prove any of it, because every one of those things is
 * mocked there.
 *
 * <p>Handles, in order on one project: a first publish going live and being served - the page with its mark and the
 * strict headers, a hashed script cached for good, a route of the app falling back to the page, a missing image being a
 * 404, and a path that climbs out of the build getting no source file; a change published as a revision being offered as
 * an update, and the update replacing what is served; a build that cannot compile failing in plain words with its output
 * while the live app goes on serving untouched; every build pod being given back; unpublishing taking the app down and
 * the sweeper deleting what it left; and publishing again coming back at the same link.
 *
 * <p>Not part of the suite - its name keeps the build from picking it up - because it needs the cluster
 * {@code k8s/preview-test-cluster.sh} stands up (with its published-apps reader and the proxy built from this
 * checkout). CI runs it with the preview test (job {@code preview-pipeline}); locally:
 *
 * <pre>
 * k8s/preview-test-cluster.sh --context kind-singularity --seed
 * ./mvnw -pl common-lib,workspace-service test -Dtest=PublishPipelineIT -Dsurefire.failIfNoSpecifiedTests=false
 * </pre>
 *
 * <p>Built like the preview test: a {@code @DataJpaTest} slice over a throwaway Postgres with the real publish classes
 * imported and {@code @EnableAsync} on, so a publish returns at once and builds in the background as it does in the
 * service; the cluster, MinIO and the proxy are reached through port-forwards the test opens itself. The spacing between
 * builds and the delay before a retired build is deleted are set to nothing so the test does not wait for them.
 * The page is fetched over a plain socket with the Host header written by hand, for the reason the preview test gives.
 */
@DataJpaTest(properties = {
        "spring.flyway.locations=classpath:db/migration",
        "spring.jpa.hibernate.ddl-auto=validate",
        "publishing.min-build-interval=0s",
        "publishing.retire-after=1s",
        "publishing.runner-wait=6m",
        "publishing.install-timeout=8m",
        "publishing.build-timeout=6m"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@EntityScan("com.singularity.workspace.entity")
@EnableJpaRepositories("com.singularity.workspace.repository")
@Import({KubernetesConfig.class, StorageConfig.class, InstanceId.class, PreviewRunnerPool.class, PublishedStore.class,
        PublishSourceReader.class, PublishBuilder.class, PublishRateLimiter.class, PublishSweeper.class,
        RevisionManifestStore.class, BlobStoreImpl.class, RevisionPublisherImpl.class, PublishPipelineIT.TestBeans.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PublishPipelineIT {

    private static final String CONTEXT = System.getProperty("preview.it.context", "kind-singularity");
    private static final String NAMESPACE = System.getProperty("preview.it.namespace", "singularity-it");
    private static final String TEMPLATE = "starter-templates/react-vite-tailwind-shadcn-starter/";
    private static final long USER_ID = 7L;
    private static final String SLUG = "it-demo";
    private static final String HOST = SLUG + ".localhost";
    private static final String MARKER = "Published by PublishPipelineIT";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private static KubernetesClient cluster;
    private static LocalPortForward minioForward;
    private static LocalPortForward proxyForward;
    private static final Map<String, Double> TIMINGS = new LinkedHashMap<>();

    @Autowired
    private PublishServiceImpl service;
    @Autowired
    private PublishedAppRepository appRepository;
    @Autowired
    private ProjectRepository projectRepository;
    @Autowired
    private RevisionPublisherImpl publisher;
    @Autowired
    private PublishSweeper sweeper;
    @Autowired
    private MinioClient minioClient;

    private Long projectId;
    private String appTsx;

    @DynamicPropertySource
    static void connect(DynamicPropertyRegistry registry) {
        WindowsTimezoneWorkaround.apply();
        POSTGRES.start();
        cluster = new KubernetesClientBuilder().withConfig(Config.autoConfigure(CONTEXT)).build();
        minioForward = forward("minio", 9000);
        proxyForward = forward("singularity-proxy", 8080);

        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("preview.kube-context", () -> CONTEXT);
        registry.add("preview.namespace", () -> NAMESPACE);
        registry.add("preview.access-token-secret", () -> secret("preview-access-token", "secret"));
        registry.add("minio.url", () -> "http://127.0.0.1:" + minioForward.getLocalPort());
        registry.add("minio.access-key", () -> secret("minio-root-credentials", "username"));
        registry.add("minio.secret-key", () -> secret("minio-root-credentials", "password"));
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
    @EnableConfigurationProperties({PreviewProperties.class, ProjectFileLimits.class, PublishingProperties.class})
    static class TestBeans {

        private final AuthUtil authUtil = mock(AuthUtil.class);
        private final AccountServiceClient accountServiceClient = mock(AccountServiceClient.class);

        @Bean
        PublishServiceImpl publishService(PublishedAppRepository appRepository, ProjectRepository projectRepository,
                                          PublishedStore store, PublishBuilder builder, PublishingProperties properties,
                                          PublishRateLimiter rateLimiter, InstanceId instanceId) {
            when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
            when(accountServiceClient.getPlanLimits(anyLong())).thenReturn(new PlanDto(1L, "Test", 10, 1_000_000, 3, false));
            return new PublishServiceImpl(appRepository, projectRepository, store, builder, properties, rateLimiter,
                    authUtil, accountServiceClient, instanceId);
        }
    }

    @BeforeAll
    void seedAProjectFromTheStarterTemplate() throws Exception {
        for (String bucket : List.of("projects", "project-blobs", "published-apps")) {
            if (!minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
            }
        }
        projectId = projectRepository.save(Project.builder().name("publish-pipeline-it").build()).getId();

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
            if (path.equals("src/App.tsx")) appTsx = new String(bytes, StandardCharsets.UTF_8);
            minioClient.putObject(PutObjectArgs.builder().bucket("projects").object(projectId + "/" + path)
                    .stream(new ByteArrayInputStream(bytes), bytes.length, -1).build());
            projectFileMetadata(path, bytes.length);
            uploaded++;
        }
        assertThat(uploaded).as("starter template files uploaded").isGreaterThan(20);
        assertThat(appTsx).isNotNull();
    }

    @Autowired
    private com.singularity.workspace.repository.ProjectFileRepository projectFileRepository;

    private void projectFileMetadata(String path, long size) {
        projectFileRepository.save(com.singularity.workspace.entity.ProjectFile.builder()
                .project(projectRepository.getReferenceById(projectId)).path(path)
                .minioObjectKey(projectId + "/" + path).size(size).type("text/plain").build());
    }

    @AfterAll
    void leaveNothingRunning() throws IOException {
        try {
            StringBuilder report = new StringBuilder();
            TIMINGS.forEach((what, seconds) -> report.append(String.format("%-52s %6.1f s%n", what, seconds)));
            System.out.println("\n[publish-timings]\n" + report);
            Files.writeString(Path.of("target", "publish-timings.txt"), report.toString());
        } finally {
            for (LocalPortForward forward : List.of(minioForward, proxyForward)) forward.close();
            cluster.close();
        }
    }

    @Test
    @Order(1)
    void aFirstPublishPutsTheAppOnlineAtItsLink() throws Exception {
        long began = System.nanoTime();
        service.publish(projectId, new PublishRequest(SLUG));
        PublishedApp app = settled();
        TIMINGS.put("first publish (install, build, store, live)", (System.nanoTime() - began) / 1e9);

        assertThat(app.getBuildStatus()).as("build: %s\n%s", app.getFailureDetail(), app.getFailureLog()).isNull();
        assertThat(app.getStatus()).isEqualTo(PublishStatus.LIVE);
        assertThat(app.getSlug()).isEqualTo(SLUG);
        assertThat(app.getLivePrefix()).isEqualTo("b1/");
        assertThat(app.getLiveFileCount()).isGreaterThan(1);

        Response page = get(HOST, "/", "text/html");
        assertThat(page.status()).isEqualTo(200);
        assertThat(page.header("content-type")).startsWith("text/html");
        assertThat(page.body()).contains("id=\"root\"").contains("Built with Singularity");
        assertThat(page.header("content-security-policy")).contains("script-src 'self'").contains("object-src 'none'");
        assertThat(page.header("x-content-type-options")).isEqualTo("nosniff");
        assertThat(page.header("set-cookie")).isNull();

        Matcher script = Pattern.compile("src=\"(/assets/[^\"]+\\.js)\"").matcher(page.body());
        assertThat(script.find()).as("the built page loads a bundled script").isTrue();
        Response asset = get(HOST, script.group(1), "*/*");
        assertThat(asset.status()).isEqualTo(200);
        assertThat(asset.header("content-type")).startsWith("text/javascript");
        assertThat(asset.header("cache-control")).contains("immutable");

        Response route = get(HOST, "/some/route/of/the/app", "text/html");
        assertThat(route.status()).as("a refresh on a route of the app").isEqualTo(200);
        assertThat(route.body()).contains("id=\"root\"");

        assertThat(get(HOST, "/img/missing.png", "*/*").status()).isEqualTo(404);
        Response climb = get(HOST, "/../src/App.tsx", "*/*");
        assertThat(climb.status()).isIn(400, 404);
        assertThat(climb.body()).doesNotContain("export default");

        PublishResponse status = service.getStatus(projectId);
        assertThat(status.live()).isTrue();
        assertThat(status.url()).isEqualTo("http://" + HOST + ":8090/");
        assertThat(status.hasChanges()).isFalse();
    }

    @Test
    @Order(2)
    void everyBuildPodIsGivenBack() throws Exception {
        List<Pod> held = eventually(Duration.ofSeconds(60),
                () -> cluster.pods().inNamespace(NAMESPACE).withLabel("app", "runner").withLabel("status", "busy").list().getItems(),
                List::isEmpty);
        assertThat(held).as("busy runner pods still held after the build").isEmpty();
    }

    @Test
    @Order(3)
    void aChangeIsOfferedAsAnUpdateAndReplacesWhatIsServed() throws Exception {
        revise(appTsx + "\nconsole.log(\"" + MARKER + "\");\n");
        assertThat(service.getStatus(projectId).hasChanges()).isTrue();

        long began = System.nanoTime();
        service.publish(projectId, null);
        PublishedApp app = settled();
        TIMINGS.put("update (install, build, store, live)", (System.nanoTime() - began) / 1e9);

        assertThat(app.getBuildStatus()).as("build: %s\n%s", app.getFailureDetail(), app.getFailureLog()).isNull();
        assertThat(app.getLivePrefix()).isEqualTo("b2/");
        assertThat(service.getStatus(projectId).hasChanges()).isFalse();

        Response served = eventually(Duration.ofSeconds(30), () -> bundleOf(get(HOST, "/", "text/html")), r -> r.body().contains(MARKER));
        assertThat(served.body()).as("the new build's script").contains(MARKER);
    }

    @Test
    @Order(4)
    void aBrokenEditFailsTheBuildInPlainWordsAndLeavesTheLiveAppAlone() throws Exception {
        revise("export default function App( {\n  return <div>\n");
        service.publish(projectId, null);
        PublishedApp app = settled();

        assertThat(app.getBuildStatus()).isEqualTo(PublishBuildStatus.FAILED);
        assertThat(app.getFailureKind()).isEqualTo(PublishFailureKind.BUILD);
        assertThat(app.getFailureDetail()).isNotBlank();
        assertThat(app.getFailureLog()).as("the bundler's own output is kept").isNotBlank();
        assertThat(app.getStatus()).as("the live app is untouched").isEqualTo(PublishStatus.LIVE);
        assertThat(app.getLivePrefix()).isEqualTo("b2/");
        assertThat(service.getBuildLog(projectId).log()).isNotBlank();
        assertThat(service.getStatus(projectId).build().failureMessage()).isNotBlank();

        Response served = bundleOf(get(HOST, "/", "text/html"));
        assertThat(served.status()).isEqualTo(200);
        assertThat(served.body()).contains(MARKER);
    }

    @Test
    @Order(5)
    void unpublishingTakesTheAppDownAndTheSweeperDeletesWhatItLeft() throws Exception {
        service.unpublish(projectId);

        Response gone = eventually(Duration.ofSeconds(30), () -> get(HOST, "/", "text/html"), r -> r.status() == 404);
        assertThat(gone.status()).isEqualTo(404);
        assertThat(gone.body()).contains("published");
        assertThat(service.getStatus(projectId).live()).isFalse();
        assertThat(service.getStatus(projectId).slug()).as("the link stays the project's").isEqualTo(SLUG);

        Thread.sleep(1500);
        sweeper.sweep();
        assertThat(objectsUnder(SLUG + "/")).as("nothing of the app is left in storage").isEmpty();
    }

    @Test
    @Order(6)
    void publishingAgainComesBackAtTheSameLink() throws Exception {
        revise(appTsx);
        service.publish(projectId, null);
        PublishedApp app = settled();

        assertThat(app.getBuildStatus()).as("build: %s\n%s", app.getFailureDetail(), app.getFailureLog()).isNull();
        assertThat(app.getStatus()).isEqualTo(PublishStatus.LIVE);
        assertThat(app.getSlug()).isEqualTo(SLUG);
        Response page = eventually(Duration.ofSeconds(30), () -> get(HOST, "/", "text/html"), r -> r.status() == 200);
        assertThat(page.status()).isEqualTo(200);
    }

    private PublishedApp settled() throws Exception {
        return eventually(Duration.ofMinutes(12), () -> appRepository.findByProjectId(projectId).orElseThrow(),
                app -> app.getBuildStatus() != PublishBuildStatus.BUILDING);
    }

    private Response bundleOf(Response page) throws IOException {
        Matcher script = Pattern.compile("src=\"(/assets/[^\"]+\\.js)\"").matcher(page.body());
        if (!script.find()) return page;
        Response asset = get(HOST, script.group(1), "*/*");
        return new Response(asset.status(), asset.headers(), page.body() + asset.body());
    }

    private void revise(String content) {
        Long parent = projectRepository.findCurrentFileRevisionId(projectId).orElse(null);
        PublishRevisionResponse response = publisher.publish(projectId, new PublishRevisionRequest(parent, USER_ID,
                "MANUAL_EDIT", List.of(new FileChangeDto("src/App.tsx", FileChangeDto.ChangeType.EDIT, content))));
        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.APPLIED);
    }

    private List<String> objectsUnder(String prefix) throws Exception {
        List<String> keys = new ArrayList<>();
        for (var result : minioClient.listObjects(
                ListObjectsArgs.builder().bucket("published-apps").prefix(prefix).recursive(true).build())) {
            keys.add(result.get().objectName());
        }
        return keys;
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

    private Response get(String hostname, String path, String accept) throws IOException {
        try (Socket socket = new Socket(InetAddress.getLoopbackAddress(), proxyForward.getLocalPort())) {
            socket.setSoTimeout(30_000);
            String request = "GET " + path + " HTTP/1.1\r\nHost: " + hostname + "\r\nAccept: " + accept
                    + "\r\nConnection: close\r\n\r\n";
            OutputStream out = socket.getOutputStream();
            out.write(request.getBytes(StandardCharsets.ISO_8859_1));
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
