using System.Data;
using Microsoft.Extensions.Configuration;
using MySqlConnector;

namespace BidaCSharp.Data;

public sealed class MySqlConnectionFactory
{
    private readonly string _connectionString;

    public MySqlConnectionFactory(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("Missing DefaultConnection string.");
    }

    public MySqlConnection CreateConnection() => new MySqlConnection(_connectionString);
}
