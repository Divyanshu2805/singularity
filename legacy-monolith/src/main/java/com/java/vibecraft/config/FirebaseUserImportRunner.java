package com.java.vibecraft.config;

import com.google.firebase.auth.ErrorInfo;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserImportOptions;
import com.google.firebase.auth.ImportUserRecord;
import com.google.firebase.auth.UserImportResult;
import com.google.firebase.auth.hash.Bcrypt;
import com.java.vibecraft.entity.User;
import com.java.vibecraft.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * One-off migration, enabled with {@code app.firebase.import-users=true}: copies every active local user that has no
 * Firebase account into Firebase, carrying the existing BCrypt hash so they keep signing in with the same password.
 *
 * <p>Imported accounts are marked email-unverified - nothing ever verified these addresses - so each person confirms
 * theirs on first Firebase sign-in. The Firebase uid is {@code legacy-<id>}, so a re-run can't create duplicates, and
 * only users with no {@code firebaseUid} yet are sent at all. Someone who already made a Firebase account with the same
 * email fails the import (Firebase allows one account per email) and is linked by email on their next sign-in instead.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnBooleanProperty("app.firebase.import-users")
public class FirebaseUserImportRunner implements ApplicationRunner {

    /** Firebase's maximum per importUsers call. */
    private static final int BATCH_SIZE = 1000;

    private final FirebaseAuth firebaseAuth;
    private final UserRepository userRepository;

    @Override
    public void run(ApplicationArguments args) throws FirebaseAuthException {
        List<User> pending = userRepository.findAllByFirebaseUidIsNullAndDeletedAtIsNull();
        log.info("Firebase user import: {} local users without a Firebase account", pending.size());

        int imported = 0;
        int failed = 0;
        for (int start = 0; start < pending.size(); start += BATCH_SIZE) {
            List<User> batch = pending.subList(start, Math.min(start + BATCH_SIZE, pending.size()));
            List<ImportUserRecord> records = batch.stream().map(FirebaseUserImportRunner::toRecord).toList();

            UserImportResult result = firebaseAuth.importUsers(records, UserImportOptions.withHash(Bcrypt.getInstance()));

            Set<Integer> failedIndexes = new HashSet<>();
            for (ErrorInfo error : result.getErrors()) {
                failedIndexes.add(error.getIndex());
                log.warn("Firebase user import: user {} failed: {}", batch.get(error.getIndex()).getId(), error.getReason());
            }
            for (int i = 0; i < batch.size(); i++) {
                if (failedIndexes.contains(i)) continue;
                User user = batch.get(i);
                user.setFirebaseUid(firebaseUidFor(user));
                userRepository.save(user);
            }
            imported += batch.size() - failedIndexes.size();
            failed += failedIndexes.size();
        }
        log.info("Firebase user import finished: {} imported, {} failed. Set app.firebase.import-users back to false.", imported, failed);
    }

    static String firebaseUidFor(User user) {
        return "legacy-" + user.getId();
    }

    private static ImportUserRecord toRecord(User user) {
        return ImportUserRecord.builder()
                .setUid(firebaseUidFor(user))
                .setEmail(user.getUsername())
                .setEmailVerified(false)
                .setDisplayName(user.getName())
                .setPasswordHash(user.getPassword().getBytes(StandardCharsets.UTF_8))
                .build();
    }
}
