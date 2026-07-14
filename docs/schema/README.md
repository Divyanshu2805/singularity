# Data Model

Entities, relationships, and the conventions that keep them consistent. Update this in the same change as any schema edit — a mismatch between this file and `entity/`/`enums/` is worse than no doc at all.

There is no migration tool in this project — schema changes happen via Hibernate's `ddl-auto: update`, which creates and widens tables automatically but never alters or drops an existing constraint. That single fact explains several rules on this page (most importantly [Persisted enums](conventions.md#persisted-enums-and-the-ddl-auto-trap) below); read it before adding a column or an enum value.

## Contents

- [Entity Overview](entity-overview.md)
- [Entity Reference](entity-reference.md)
- [Domain Vocabulary (Enums)](enums.md)
- [Design Conventions Worth Knowing](conventions.md)
