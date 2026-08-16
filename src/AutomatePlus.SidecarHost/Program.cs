using System.Text.Json;
using System.Text.Json.Serialization;
using AutomatePlus.Application;
using AutomatePlus.Domain;

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = false
};
jsonOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));

await RunProtocolAsync(Console.In, Console.Out, Console.Error, jsonOptions);

static async Task RunProtocolAsync(TextReader input, TextWriter output, TextWriter diagnostics, JsonSerializerOptions jsonOptions)
{
    string? line;
    while ((line = await input.ReadLineAsync()) is not null)
    {
        if (string.IsNullOrWhiteSpace(line)) continue;
        JsonDocument? document = null;
        try
        {
            document = JsonDocument.Parse(line);
            var root = document.RootElement;
            var correlationId = root.GetProperty("correlationId").GetString() ?? throw new JsonException("correlationId is required");
            var method = root.GetProperty("method").GetString() ?? throw new JsonException("method is required");
            var protocolVersion = root.GetProperty("protocolVersion").GetString();
            if (protocolVersion != "1.0") throw new AutomationException(AutomationErrorCode.ProtocolError, "Unsupported protocol version");
            var kind = root.GetProperty("kind").GetString();
            object result = kind == "cancel"
                ? new { cancelled = true, targetCorrelationId = root.GetProperty("payload").GetProperty("targetCorrelationId").GetString() }
                : await DispatchAsync(method, root.GetProperty("payload"), jsonOptions, diagnostics);
            await WriteAsync(output, new
            {
                protocolVersion = "1.0",
                kind = "response",
                correlationId,
                method,
                payload = new { ok = true, data = result }
            }, jsonOptions);
        }
        catch (Exception exception)
        {
            diagnostics.WriteLine($"protocol error: {exception.Message}");
            diagnostics.Flush();
            var correlationId = TryGetString(document?.RootElement, "correlationId") ?? Guid.NewGuid().ToString("D");
            var method = TryGetString(document?.RootElement, "method") ?? "protocol.error";
            var (code, message) = exception is AutomationException automation
                ? (automation.Code.ToString(), automation.Message)
                : (AutomationErrorCode.ProtocolError.ToString(), exception.Message);
            await WriteAsync(output, new
            {
                protocolVersion = "1.0",
                kind = "response",
                correlationId,
                method,
                payload = new { ok = false, error = new { code, name = exception.GetType().Name, message, details = new { } } }
            }, jsonOptions);
        }
        finally
        {
            document?.Dispose();
        }
    }
}

static async Task<object> DispatchAsync(string method, JsonElement payload, JsonSerializerOptions jsonOptions, TextWriter diagnostics)
{
    return method switch
    {
        "health" => new { status = "ready", process = Environment.ProcessId },
        "session.validate" => ValidateSession(payload, jsonOptions),
        _ => throw new AutomationException(AutomationErrorCode.ProtocolError, $"Unsupported sidecar method: {method}")
    };
}

static object ValidateSession(JsonElement payload, JsonSerializerOptions jsonOptions)
{
    var sessionElement = payload.TryGetProperty("session", out var session) ? session : payload;
    var parsed = JsonSerializer.Deserialize<AutomationSession>(sessionElement.GetRawText(), jsonOptions)
        ?? throw new AutomationException(AutomationErrorCode.ProtocolError, "Session payload is empty");
    var errors = new SessionValidator().Validate(parsed);
    return new { valid = errors.Count == 0, errors };
}

static string? TryGetString(JsonElement? root, string property)
{
    if (root is null || root.Value.ValueKind != JsonValueKind.Object || !root.Value.TryGetProperty(property, out var value)) return null;
    return value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}

static async Task WriteAsync(TextWriter output, object value, JsonSerializerOptions jsonOptions)
{
    await output.WriteLineAsync(JsonSerializer.Serialize(value, jsonOptions));
    await output.FlushAsync();
}
