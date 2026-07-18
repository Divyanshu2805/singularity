package com.vibecraft.account.repository;

import com.vibecraft.account.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    Optional<User> findFirstByUsernameIgnoreCaseOrderByIdAsc(String username);

    Optional<User> findByFirebaseUid(String firebaseUid);
}
