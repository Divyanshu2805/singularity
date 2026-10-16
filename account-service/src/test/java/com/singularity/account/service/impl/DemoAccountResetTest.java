package com.singularity.account.service.impl;

import com.singularity.account.service.DemoAccountService;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * When the demo account is reset: a start-up makes it only when it does not exist, never wiping one a visitor may be
 * using, and a failed run is tried again on the next tick until it succeeds.
 */
class DemoAccountResetTest {

    private final DemoAccountService demoAccountService = mock(DemoAccountService.class);
    private final DemoAccountReset reset = new DemoAccountReset(demoAccountService);

    @Test
    void anAccountThatExistsIsLeftAloneAtStartUp() {
        when(demoAccountService.exists()).thenReturn(true);

        reset.whenDue();
        reset.whenDue();

        verify(demoAccountService, never()).reset();
        verify(demoAccountService, times(1)).exists();
    }

    @Test
    void aMissingAccountIsMadeAndAFailedRunIsTriedAgain() {
        when(demoAccountService.exists()).thenReturn(false);
        doThrow(new IllegalStateException("workspace-service is not up")).doNothing().when(demoAccountService).reset();

        reset.whenDue();
        reset.whenDue();
        reset.whenDue();

        verify(demoAccountService, times(2)).reset();
    }

    @Test
    void theDailyRunAlwaysResets() {
        doNothing().when(demoAccountService).reset();

        reset.daily();

        verify(demoAccountService).reset();
        verify(demoAccountService, never()).exists();
    }
}
