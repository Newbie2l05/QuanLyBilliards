using System.Diagnostics;
using System.Net.Sockets;

namespace BidaCSharp.Services;

public sealed class LocalMySqlRuntimeService : IHostedService
{
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<LocalMySqlRuntimeService> _logger;

    public LocalMySqlRuntimeService(
        IConfiguration configuration,
        IWebHostEnvironment environment,
        ILogger<LocalMySqlRuntimeService> logger)
    {
        _configuration = configuration;
        _environment = environment;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var section = _configuration.GetSection("LocalRuntimeDatabase");
        if (!section.GetValue("Enabled", true))
        {
            return;
        }

        var host = section["Host"] ?? "127.0.0.1";
        var port = section.GetValue("Port", 3307);
        var timeoutSeconds = section.GetValue("StartupTimeoutSeconds", 20);

        if (await IsPortOpenAsync(host, port, cancellationToken))
        {
            _logger.LogInformation("MySQL runtime already available on {Host}:{Port}", host, port);
            return;
        }

        var scriptPath = section["StartScriptPath"] ?? "start-bidacsharp-runtime.ps1";
        var resolvedScriptPath = Path.IsPathRooted(scriptPath)
            ? scriptPath
            : Path.Combine(_environment.ContentRootPath, scriptPath);

        if (!File.Exists(resolvedScriptPath))
        {
            throw new FileNotFoundException($"MySQL runtime start script not found: {resolvedScriptPath}");
        }

        _logger.LogInformation("Starting local MySQL runtime using {ScriptPath}", resolvedScriptPath);

        var process = Process.Start(new ProcessStartInfo
        {
            FileName = "powershell",
            Arguments = $"-ExecutionPolicy Bypass -File \"{resolvedScriptPath}\"",
            WorkingDirectory = _environment.ContentRootPath,
            UseShellExecute = false,
            CreateNoWindow = true
        });

        if (process is null)
        {
            throw new InvalidOperationException("Failed to start local MySQL runtime script.");
        }

        var deadline = DateTime.UtcNow.AddSeconds(timeoutSeconds);
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (await IsPortOpenAsync(host, port, cancellationToken))
            {
                _logger.LogInformation("Local MySQL runtime ready on {Host}:{Port}", host, port);
                return;
            }

            await Task.Delay(1000, cancellationToken);
        }

        throw new TimeoutException($"Local MySQL runtime did not start on {host}:{port} within {timeoutSeconds} seconds.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static async Task<bool> IsPortOpenAsync(string host, int port, CancellationToken cancellationToken)
    {
        try
        {
            using var client = new TcpClient();
            await client.ConnectAsync(host, port, cancellationToken);
            return client.Connected;
        }
        catch
        {
            return false;
        }
    }
}
