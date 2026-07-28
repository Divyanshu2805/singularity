package com.vibecraft.account.repository;

import com.vibecraft.account.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Reads and writes accounts.
 *
 * <p>Handles: lookup by username exactly or case-insensitively, and lookup by Firebase uid - the one session
 * authentication uses on every cache miss.
 *
 * <p>Soft deletion has no automatic filter, so a caller that must exclude deleted users has to check deletedAt
 * itself.
 */
@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    Optional<User> findFirstByUsernameIgnoreCaseOrderByIdAsc(String username);

    Optional<User> findByFirebaseUid(String firebaseUid);
}
