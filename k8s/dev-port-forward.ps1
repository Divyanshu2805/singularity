# The backend now does this itself while it runs (PreviewPortForwarder, preview.port-forward in application.yaml).
# This script is only for when that is disabled, or to reach previews without the backend running.
#
# Makes the local kind cluster's preview pieces reachable from this machine, for as long as this window stays open:
#   http://<anything>.localhost:8090  -> the preview proxy  (what the browser loads)
#   localhost:6379                    -> Redis               (where the backend writes preview routes)
# kind has no load balancer and no host port mappings, so without this the backend can't publish a route and the
# browser can't reach one. Each forward is restarted if it drops (it does whenever the target pod restarts).
#
# Usage:  powershell -ExecutionPolicy Bypass -File k8s\dev-port-forward.ps1

$namespace = "vibecraft-ai"
$forwards = @(
    @{ Name = "preview proxy"; Target = "svc/vibecraft-proxy-svc"; Ports = "8090:80" },
    @{ Name = "redis";         Target = "svc/redis-service";         Ports = "6379:6379" }
)

$jobs = foreach ($forward in $forwards) {
    Start-Job -Name $forward.Name -ScriptBlock {
        param($ns, $target, $ports, $name)
        while ($true) {
            Write-Output "[$name] forwarding $ports"
            kubectl -n $ns port-forward $target $ports --address 127.0.0.1 2>&1
            Write-Output "[$name] dropped, reconnecting in 2s"
            Start-Sleep -Seconds 2
        }
    } -ArgumentList $namespace, $forward.Target, $forward.Ports, $forward.Name
}

Write-Host "Previews: http://<preview>.localhost:8090   Redis: localhost:6379   (Ctrl+C to stop)"
try {
    while ($true) {
        $jobs | Receive-Job
        Start-Sleep -Seconds 1
    }
} finally {
    $jobs | Stop-Job
    $jobs | Remove-Job -Force
}
