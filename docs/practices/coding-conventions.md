# Coding Conventions

## Backend

### Layering

Controllers orchestrate, services decide, repositories query. A controller never calls a repository directly, and a repository never contains business logic. The full per-package rules are in the [module map](../architecture/module-map.md#inside-a-domain-service).

### Entities

- Annotate with `@Getter @Setter @FieldDefaults(level = AccessLevel.PRIVATE) @AllArgsConstructor @NoArgsConstructor @Builder`.
- Use `@CreationTimestamp` / `@UpdateTimestamp` for lifecycle timestamps, not `@PrePersist` / `@PreUpdate`.
- Composite keys (`ProjectMember`, `ChatSession`) use `@EmbeddedId` with `@MapsId` and a dedicated `@Embeddable`, `Serializable` id class implementing `equals()` and `hashCode()`.
- Soft delete is a plain nullable `deletedAt` column with no framework filter: every query against `User`, `Project` or `ChatSession` must exclude deleted rows explicitly.
- Every schema change is a Flyway migration. See [changing the schema](../schema/conventions.md#changing-the-schema).

### DTOs

- Request DTOs are records with Bean Validation constraints, each with an explicit `message = "..."`, bound with `@RequestBody @Valid`.
- Response DTOs never carry validation annotations.

### Repositories

Plain `JpaRepository<Entity, Id>` interfaces. Add `@Query` JPQL only when a service needs it. Where an insert must detect a conflict on a manually assigned id, use a native `INSERT … ON CONFLICT` rather than `save()` (see [upserts](../schema/conventions.md#upserts-need-native-sql)).

### Mapping

Use MapStruct (`@Mapper(componentModel = "spring")`) and add an explicit `@Mapping` only when field names differ. MapStruct matches identical names silently, including nested objects — and a mismatch silently leaves the target field `null`. If a mapped field is unexpectedly `null`, check the names before suspecting the mapper.

### Exceptions

Throw, or let propagate, an existing typed exception from `common-lib`'s `error` package — not a bare `RuntimeException` or an unmessaged `Optional.orElseThrow()` — so it maps to a specific status instead of a generic `500`. See the [error reference](../api/errors.md).

### Configuration

- Every secret is a bare `${ENV_VAR}` placeholder in `application.yaml` with **no default**. A missing value must fail startup, never fall back to something insecure.
- A `@Configuration`, `@Component` or `@Service` class must live under its service's component-scan root (`com.vibecraft.<service>`). A new `common-lib` class that must be a bean has to be registered in `CommonLibAutoConfiguration`.

## Frontend

- Pure logic belongs in `lib/`, where it can be tested without rendering. `lib/` never imports from `components/` or `pages/`.
- `components/ui/` is the vendored shadcn/ui set; treat it as a library.
- Any module-level store that holds project- or user-specific data must register a reset with `onSignOut(...)` in `lib/session.ts`.

## Source-file headers

Every source file (`.java`, `.ts`, `.tsx`, `.js`) opens with one block comment that says what the file is, a `Handles:` paragraph listing the behaviour it owns, and — where relevant — its non-obvious invariants and the history behind them. There are **no other comments**: anything that needs explaining belongs in that header.

The exceptions are toolchain directives (`// eslint-disable-next-line`, `/// <reference …>`) and Flyway migration SQL, whose comments are part of a checksum and must never change once applied.

## Things to avoid

- **Editing an applied migration**, or changing a database schema by hand. Write a new migration.
- **Loosening a security boundary** — widening a `@PreAuthorize` gate, adding a CSRF or CSP exemption — to make a feature work. Raise it instead.
- **Duplicating an existing abstraction** — a second file-storage layer, a second syntax highlighter, a second diff implementation. Extend the one that exists.
- **Committing secrets**, a working credential default, or a `.env` / `.env.local` file. Check that `.gitignore` covers any new secret file before relying on it.
