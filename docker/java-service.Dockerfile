# Shared image for the five Spring Boot services (discovery, gateway, account, workspace, intelligence).
#
# Handles: extracting the Spring Boot layered jar into separate Docker layers (dependencies change far less often
# than application code, so a redeploy only pushes/pulls the small `application` layer) and running it as a
# non-root user with the JVM memory flags docs/deployment/phase-2-container-images.md's Phase 2 specifies.
#
# Build from the repo root (`docker build -f docker/java-service.Dockerfile --build-arg MODULE=<module-dir> .`)
# AFTER `./mvnw clean package` has already produced that module's jar under `<module>/target/` - the CI pipeline
# builds and tests the reactor first, so this file only packages a jar it did not build itself (CLAUDE.md: build
# and test as a reactor, not a module in isolation).

ARG MODULE

FROM eclipse-temurin:25-jre-alpine AS extract
ARG MODULE
WORKDIR /workspace
COPY ${MODULE}/target/${MODULE}-*.jar application.jar
RUN java -Djarmode=tools -jar application.jar extract --layers --launcher --destination extracted

FROM eclipse-temurin:25-jre-alpine
RUN addgroup -g 1000 -S spring && adduser -u 1000 -S spring -G spring
WORKDIR /app
COPY --from=extract --chown=spring:spring /workspace/extracted/dependencies/ ./
COPY --from=extract --chown=spring:spring /workspace/extracted/spring-boot-loader/ ./
COPY --from=extract --chown=spring:spring /workspace/extracted/snapshot-dependencies/ ./
COPY --from=extract --chown=spring:spring /workspace/extracted/application/ ./
USER spring:spring
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -Xss512k"
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
