# Data Model

Entities, relationships, and the conventions that keep them consistent. Update this in the same change as any schema edit — a mismatch between this file and a service's `entity/`, `enums/` and `db/migration/` is worse than no doc at all.

The data is split across **three databases, one per service**, and each service owns its schema through Flyway migrations. Hibernate only *validates* (`ddl-auto: validate`); it never creates or alters anything. Two consequences run through this page: a service can only join its own tables (a reference into another service's data is a plain id, never a foreign key — see [Cross-service references](cross-service-references.md#cross-service-references)), and adding a column or an enum value is a new migration, not just an entity edit (see [Changing the schema](conventions.md#changing-the-schema)).

## Contents

- [The Three Databases](databases.md)
- [Cross-service references](cross-service-references.md)
- [account-service](account-service.md)
- [workspace-service](workspace-service.md)
- [intelligence-service](intelligence-service.md)
- [Domain Vocabulary (Enums)](enums.md)
- [Design Conventions Worth Knowing](conventions.md)
