package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.dto.FileChangeDto;
import com.vibecraft.common.dto.PublishRevisionRequest;
import com.vibecraft.common.dto.PublishRevisionResponse;
import com.vibecraft.common.util.WindowsTimezoneWorkaround;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.repository.ProjectFileRepository;
import com.vibecraft.workspace.repository.ProjectFileRevisionEntryRepository;
import com.vibecraft.workspace.repository.ProjectFileRevisionRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CODE_REVIEW.md AI-05: proves the atomicity this whole design exists for against real infrastructure, not mocks -
 * a mocked {@code MinioClient}/repository cannot demonstrate that a Postgres transaction genuinely rolled back or
 * that two concurrent transactions really do serialize to one winner. This is this codebase's first Testcontainers
 * test (see CODE_TODO.md's decision record); everywhere else in this repo mocks {@code MinioClient}/repositories
 * directly, and that convention still holds for anything not specifically about cross-system atomicity.
 *
 * <p>A {@code @DataJpaTest} slice, not {@code @SpringBootTest}: only the JPA layer plus the specific
 * {@code @Service} beans under test are imported - no Feign, no web layer, no Firebase, so this doesn't need the
 * workarounds {@code FullChainFileAccessTest}'s header documents for pulling in the full auto-configuration.
 * {@code @AutoConfigureTestDatabase(replace = NONE)} keeps Spring from substituting an embedded database for the
 * real Testcontainers Postgres, and the class-level {@code @Transactional(NOT_SUPPORTED)} turns off
 * {@code @DataJpaTest}'s default per-test rollback wrapper, which would otherwise hide two threads behind one
 * connection and defeat the concurrency test's entire point.
 *
 * <p>{@link WindowsTimezoneWorkaround} is applied manually in {@code @BeforeAll}: its own javadoc says a bare test
 * run never goes through {@code main()}, so nothing else here would apply it before the first real JDBC connection.
 */
@DataJpaTest(properties = {
        "spring.flyway.locations=classpath:db/migration",
        "spring.jpa.hibernate.ddl-auto=validate"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@EntityScan("com.vibecraft.workspace.entity")
@EnableJpaRepositories("com.vibecraft.workspace.repository")
@Import({RevisionManifestStore.class, BlobStoreImpl.class, RevisionPublisherImpl.class,
        RevisionPublisherIntegrationTest.TestBeans.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Testcontainers
class RevisionPublisherIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    // quay.io, not Docker Hub's minio/minio - this repo's own k8s/runner-pods.yml and services.docker-compose.yml
    // already pull MinIO from quay.io, since MinIO stopped publishing images to Docker Hub.
    @Container
    static final MinIOContainer MINIO = new MinIOContainer(
            DockerImageName.parse("quay.io/minio/minio:RELEASE.2024-01-16T16-07-38Z").asCompatibleSubstituteFor("minio/minio"));

    private static final String PROJECT_BUCKET = "projects";
    private static final String BLOB_BUCKET = "project-blobs";

    @BeforeAll
    static void prepareInfrastructure() throws Exception {
        WindowsTimezoneWorkaround.apply();

        MinioClient minioClient = MinioClient.builder()
                .endpoint(MINIO.getS3URL())
                .credentials(MINIO.getUserName(), MINIO.getPassword())
                .build();
        for (String bucket : List.of(PROJECT_BUCKET, BLOB_BUCKET)) {
            if (!minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
            }
        }
    }

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("minio.project-bucket", () -> PROJECT_BUCKET);
        registry.add("minio.blob-bucket", () -> BLOB_BUCKET);
    }

    @Autowired
    private ProjectRepository projectRepository;
    @Autowired
    private ProjectFileRepository projectFileRepository;
    @Autowired
    private ProjectFileRevisionRepository revisionRepository;
    @Autowired
    private ProjectFileRevisionEntryRepository entryRepository;
    @Autowired
    private RevisionPublisherImpl publisher;
    @Autowired
    private MinioClient minioClient;

    private Long newProject() {
        return projectRepository.save(Project.builder().name("test-project").build()).getId();
    }

    private PublishRevisionRequest edit(Long expectedParent, String path, String content) {
        return new PublishRevisionRequest(expectedParent, 7L, "MANUAL_EDIT",
                List.of(new FileChangeDto(path, FileChangeDto.ChangeType.EDIT, content)));
    }

    @Test
    @DisplayName("two concurrent publishes against the same parent revision: exactly one wins via the real CAS")
    void concurrentPublishesSerializeToExactlyOneWinner() throws Exception {
        Long projectId = newProject();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CompletableFuture<PublishRevisionResponse> first = CompletableFuture.supplyAsync(
                    () -> publisher.publish(projectId, edit(null, "a.tsx", "from thread A")), pool);
            CompletableFuture<PublishRevisionResponse> second = CompletableFuture.supplyAsync(
                    () -> publisher.publish(projectId, edit(null, "b.tsx", "from thread B")), pool);
            CompletableFuture.allOf(first, second).get();

            List<PublishRevisionResponse.Status> statuses = List.of(first.get().status(), second.get().status());
            assertThat(statuses).containsExactlyInAnyOrder(
                    PublishRevisionResponse.Status.APPLIED, PublishRevisionResponse.Status.CONFLICT);
        } finally {
            pool.shutdown();
        }
    }

    @Test
    @DisplayName("restoring an earlier revision reproduces its exact content, read back through the real read path")
    void restoreReproducesExactContentThroughTheRealReadPath() {
        Long projectId = newProject();

        PublishRevisionResponse revisionA = publisher.publish(projectId, new PublishRevisionRequest(null, 7L, "MANUAL_EDIT", List.of(
                new FileChangeDto("src/App.tsx", FileChangeDto.ChangeType.EDIT, "revision A content"),
                new FileChangeDto("src/Keep.tsx", FileChangeDto.ChangeType.EDIT, "never changes"))));
        assertThat(revisionA.status()).isEqualTo(PublishRevisionResponse.Status.APPLIED);

        PublishRevisionResponse revisionB = publisher.publish(projectId, new PublishRevisionRequest(revisionA.revisionId(), 7L, "MANUAL_EDIT", List.of(
                new FileChangeDto("src/App.tsx", FileChangeDto.ChangeType.EDIT, "revision B content - overwritten"),
                new FileChangeDto("src/New.tsx", FileChangeDto.ChangeType.EDIT, "added in B"))));
        assertThat(revisionB.status()).isEqualTo(PublishRevisionResponse.Status.APPLIED);

        // Restore to A: compute the diff by hand here (RevisionServiceImpl's own restore() is covered by wiring
        // this same publisher, but this test wants full control over what changes to assert against).
        PublishRevisionResponse restore = publisher.publish(projectId, new PublishRevisionRequest(revisionB.revisionId(), 7L, "RESTORE", List.of(
                new FileChangeDto("src/App.tsx", FileChangeDto.ChangeType.EDIT, "revision A content"),
                new FileChangeDto("src/New.tsx", FileChangeDto.ChangeType.DELETE, null))));
        assertThat(restore.status()).isEqualTo(PublishRevisionResponse.Status.APPLIED);

        assertThat(projectFileRepository.findByProjectIdAndPath(projectId, "src/New.tsx")).isEmpty();

        // The literal "restore reproduces exact files" proof (CODE_TODO.md GATE-02), read back through the same
        // production read path every other caller uses - not a direct blob read.
        ProjectFileServiceImpl fileService = new ProjectFileServiceImpl(
                projectRepository, projectFileRepository, minioClient, null, PROJECT_BUCKET);
        assertThat(fileService.getFileContent(projectId, "src/App.tsx").content()).isEqualTo("revision A content");
        assertThat(fileService.getFileContent(projectId, "src/Keep.tsx").content()).isEqualTo("never changes");

        Project project = projectRepository.findById(projectId).orElseThrow();
        assertThat(project.getCurrentFileRevisionId()).isEqualTo(restore.revisionId());
        assertThat(revisionRepository.findByProjectIdOrderByIdDesc(projectId)).hasSize(3);
        assertThat(entryRepository.findByRevisionId(restore.revisionId())).hasSize(2);
    }

    @org.springframework.boot.test.context.TestConfiguration
    static class TestBeans {

        @Bean
        MinioClient minioClient() {
            return MinioClient.builder()
                    .endpoint(MINIO.getS3URL())
                    .credentials(MINIO.getUserName(), MINIO.getPassword())
                    .build();
        }
    }
}
