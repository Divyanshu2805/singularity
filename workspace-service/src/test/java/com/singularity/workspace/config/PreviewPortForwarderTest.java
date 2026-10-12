package com.singularity.workspace.config;

import com.singularity.workspace.config.PreviewPortForwardProperties.Forward;
import com.singularity.workspace.config.PreviewPortForwarder.ForwardState;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.PodBuilder;
import io.fabric8.kubernetes.api.model.PodList;
import io.fabric8.kubernetes.api.model.PodListBuilder;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.LocalPortForward;
import io.fabric8.kubernetes.client.dsl.FilterWatchListDeletable;
import io.fabric8.kubernetes.client.dsl.MixedOperation;
import io.fabric8.kubernetes.client.dsl.NonNamespaceOperation;
import io.fabric8.kubernetes.client.dsl.PodResource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers when the watchdog replaces a local port-forward and, above all, when it must not.
 *
 * <p>Handles: a forward whose listener is open and whose pod is ready being kept even though the client has recorded
 * a failed connection through it - replacing it there cut every other connection, which is what left a loading
 * preview blank; and the two cases that do call for a new one, the pod no longer being ready and the listener having
 * closed.
 */
class PreviewPortForwarderTest {

    private static final String NAMESPACE = "singularity-ai";

    private final KubernetesClient client = mock(KubernetesClient.class);
    @SuppressWarnings("unchecked")
    private final MixedOperation<Pod, PodList, PodResource> everyPod = mock(MixedOperation.class);
    @SuppressWarnings("unchecked")
    private final NonNamespaceOperation<Pod, PodList, PodResource> pods = mock(NonNamespaceOperation.class);
    private final PreviewProperties previewProperties = new PreviewProperties(
            NAMESPACE, "http", "localhost", null, 5173, "local", "projects",
            Duration.ofMinutes(30), Duration.ofMinutes(2), Duration.ofMinutes(5), "secret", Duration.ofHours(6),
            Duration.ofMinutes(5));
    private final Forward forward = new Forward("preview proxy", Map.of("app", "singularity-proxy"), 8080, aFreePort());
    private final PreviewPortForwarder forwarder = new PreviewPortForwarder(
            client, previewProperties, new PreviewPortForwardProperties(true, List.of(forward)));

    @BeforeEach
    void aClusterWithOneNamespace() {
        when(client.pods()).thenReturn(everyPod);
        when(everyPod.inNamespace(NAMESPACE)).thenReturn(pods);
    }

    private PodResource named(String podName, Pod pod) {
        PodResource resource = mock(PodResource.class);
        when(resource.get()).thenReturn(pod);
        when(pods.withName(podName)).thenReturn(resource);
        return resource;
    }

    private static int aFreePort() {
        try (ServerSocket socket = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            return socket.getLocalPort();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Pod readyPod(String name) {
        return new PodBuilder().withNewMetadata().withName(name).endMetadata()
                .withNewStatus().withPhase("Running").addNewContainerStatus().withReady(true).endContainerStatus().endStatus()
                .build();
    }

    private ForwardState openOn(String podName, LocalPortForward current) {
        ForwardState state = new ForwardState(forward);
        state.current = current;
        state.podName = podName;
        return state;
    }

    private LocalPortForward aNewForwardTo(String podName) {
        LocalPortForward opened = mock(LocalPortForward.class);
        @SuppressWarnings("unchecked")
        FilterWatchListDeletable<Pod, PodList, PodResource> labelled = mock(FilterWatchListDeletable.class);
        when(pods.withLabels(forward.podLabels())).thenReturn(labelled);
        when(labelled.list()).thenReturn(new PodListBuilder().withItems(readyPod(podName)).build());
        PodResource resource = named(podName, readyPod(podName));
        when(resource.portForward(anyInt(), any(InetAddress.class), anyInt())).thenReturn(opened);
        return opened;
    }

    @Test
    void aForwardThatIsOpenToAReadyPodIsKeptAfterOneConnectionThroughItFailed() throws IOException {
        LocalPortForward current = mock(LocalPortForward.class);
        when(current.isAlive()).thenReturn(true);
        when(current.errorOccurred()).thenReturn(true);
        ForwardState state = openOn("proxy-1", current);
        named("proxy-1", readyPod("proxy-1"));

        forwarder.ensure(state);

        verify(current, never()).close();
        assertThat(state.current).isSameAs(current);
        assertThat(state.podName).isEqualTo("proxy-1");
    }

    @Test
    void aForwardWhosePodIsNoLongerReadyIsReplacedByOneToAReadyPod() throws IOException {
        LocalPortForward current = mock(LocalPortForward.class);
        when(current.isAlive()).thenReturn(true);
        ForwardState state = openOn("proxy-1", current);
        named("proxy-1", null);
        LocalPortForward opened = aNewForwardTo("proxy-2");

        forwarder.ensure(state);

        verify(current).close();
        assertThat(state.current).isSameAs(opened);
        assertThat(state.podName).isEqualTo("proxy-2");
    }

    @Test
    void aForwardWhoseListenerHasClosedIsOpenedAgain() throws IOException {
        LocalPortForward current = mock(LocalPortForward.class);
        when(current.isAlive()).thenReturn(false);
        ForwardState state = openOn("proxy-1", current);
        LocalPortForward opened = aNewForwardTo("proxy-1");

        forwarder.ensure(state);

        verify(current).close();
        assertThat(state.current).isSameAs(opened);
    }
}
