package com.singularity.account.service.impl;

import com.singularity.account.entity.User;
import com.singularity.account.feign.IntelligenceServiceClient;
import com.singularity.account.feign.WorkspaceServiceClient;
import com.singularity.account.repository.AuthAuditEventRepository;
import com.singularity.account.repository.UserRepository;
import com.singularity.account.service.DemoAccountService;
import com.singularity.common.dto.DeleteUserDataRequest;
import com.singularity.common.dto.ProjectSummaryDto;
import com.singularity.common.dto.ProjectTitleDto;
import com.singularity.common.security.DemoAccount;
import com.singularity.common.security.IdentityVerifier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * Makes the shared demo account from nothing, or puts it back to how it started.
 *
 * <p>Handles, in order: making the Firebase user again under the fixed demo uid, with the public address and password
 * and the name the README's screenshots show; finding or making its row; having workspace-service and
 * intelligence-service delete everything it holds, exactly as deleting an account does; having workspace-service make
 * the sample project from the starter template and intelligence-service record that project's first build; and
 * deleting its security trail.
 *
 * <p>Why the Firebase user is made again rather than updated. A visitor can change the password, the address and the
 * name, or add a second factor, straight from the browser with Firebase, where no service can refuse it (DemoAccount).
 * Deleting and making the user again undoes all of it at once. It also ends every session of the account, since a
 * session from before is older than the user it names - which is what a reset should do.
 *
 * <p>Order. The other services' data goes after the Firebase user and the row, so a failure part way leaves an account
 * that can still sign in, and every step can be repeated: running the reset again finishes what a failed run started.
 * The sample is made last, after everything the last visitor left has gone. Nothing here is a transaction, like
 * account deletion: the calls out would hold a database connection for their whole duration.
 *
 * <p>The password is public on purpose, so it is a plain property with a default, not a secret.
 */
@Slf4j
@Service
public class DemoAccountServiceImpl implements DemoAccountService {

    static final String NAME = "Demo User";
    static final String SAMPLE_TITLE = "Quick notes you can jot and clear";

    private final DemoAccount demoAccount;
    private final IdentityVerifier identityVerifier;
    private final UserRepository userRepository;
    private final AuthAuditEventRepository authAuditEventRepository;
    private final WorkspaceServiceClient workspaceServiceClient;
    private final IntelligenceServiceClient intelligenceServiceClient;
    private final String email;
    private final String password;

    public DemoAccountServiceImpl(DemoAccount demoAccount, IdentityVerifier identityVerifier,
                                  UserRepository userRepository, AuthAuditEventRepository authAuditEventRepository,
                                  WorkspaceServiceClient workspaceServiceClient,
                                  IntelligenceServiceClient intelligenceServiceClient,
                                  @Value("${demo.email:demo@singularity.dev}") String email,
                                  @Value("${demo.password:demo1234}") String password) {
        this.demoAccount = demoAccount;
        this.identityVerifier = identityVerifier;
        this.userRepository = userRepository;
        this.authAuditEventRepository = authAuditEventRepository;
        this.workspaceServiceClient = workspaceServiceClient;
        this.intelligenceServiceClient = intelligenceServiceClient;
        this.email = email;
        this.password = password;
    }

    @Override
    public void reset() {
        String uid = demoAccount.firebaseUid();
        identityVerifier.recreateUser(uid, email, password, NAME);

        User user = live(userRepository.findByFirebaseUid(uid))
                .or(() -> live(userRepository.findByUsername(email)))
                .orElseGet(User::new);
        user.setFirebaseUid(uid);
        user.setUsername(email);
        user.setName(NAME);
        user = userRepository.save(user);
        Long userId = user.getId();

        workspaceServiceClient.deleteUserData(userId, new DeleteUserDataRequest(email));
        intelligenceServiceClient.deleteUserData(userId);
        ProjectSummaryDto sample = workspaceServiceClient.createDemoProject(userId, new ProjectTitleDto(SAMPLE_TITLE));
        intelligenceServiceClient.recordDemoBuild(sample.id(), userId);
        authAuditEventRepository.deleteOfAccount(userId, uid);
        log.info("Put the demo account (user {}) back, with its sample project {}", userId, sample.id());
    }

    @Override
    public boolean exists() {
        return live(userRepository.findByFirebaseUid(demoAccount.firebaseUid())).isPresent();
    }

    private static Optional<User> live(Optional<User> user) {
        return user.filter(found -> found.getDeletedAt() == null);
    }
}
