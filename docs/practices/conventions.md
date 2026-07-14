# Coding Conventions

- **Entities:** `@Getter @Setter @FieldDefaults(level = AccessLevel.PRIVATE) @AllArgsConstructor @NoArgsConstructor @Builder`, plus `@CreationTimestamp`/`@UpdateTimestamp` for lifecycle timestamps — not manual `@PrePersist`/`@PreUpdate`.
- **Composite keys** (`ProjectMember`, `ChatSession`): `@EmbeddedId` + `@MapsId`, with a small dedicated `@Embeddable, Serializable` ID class carrying `equals()`/`hashCode()` over its fields.
- **Soft delete** is a plain nullable `deletedAt` column with **no** `@SQLDelete`/`@Where` filter wired up — every query against `User`/`Project`/`ChatSession` must exclude deleted rows explicitly. Nothing will do it for you.
- **Request DTOs** are records with Bean Validation constraints, each with an explicit `message = "..."`, bound with `@RequestBody @Valid`. **Response DTOs never carry validation annotations** — they're output, not input to reject.
- **Repositories** are plain `JpaRepository<X, Id>` interfaces; add `@Query` JPQL only when a service actually needs it, not speculatively.
- **Mapping** goes through MapStruct (`@Mapper(componentModel = "spring")`); add an explicit `@Mapping` only when entity/DTO field names differ — MapStruct auto-matches identical names, including nested objects, silently. **A silent mismatch leaves a field `null` with no error** — this has happened more than once (`FileNode.modifiedAt`, `SubscriptionResponse.periodEnd`); if a mapped field is unexpectedly null, check the field names match before assuming the mapper is broken.
- **Exceptions:** throw (or let bubble) an existing typed exception (`error/`) rather than a bare `RuntimeException` or an unmessaged `Optional.orElseThrow()`, so it lands on a specific `GlobalExceptionHandler` handler instead of the generic 500. Full taxonomy: `docs/api/`.
- **Commit messages:** one line, semantic (`feat:`, `fix:`, `docs:`, `chore:`).
