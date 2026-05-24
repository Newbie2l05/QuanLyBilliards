using BidaCSharp.Data;
using BidaCSharp.Models;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BidaCSharp.Controllers;

[Authorize]
[Route("api")]
public sealed class MenuController : AppApiController
{
    private readonly MySqlConnectionFactory _connectionFactory;

    public MenuController(MySqlConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    [HttpGet("menu")]
    public async Task<IActionResult> GetMenu()
    {
        using var connection = _connectionFactory.CreateConnection();
        var categories = (await connection.QueryAsync<menu_category_record>(
            "SELECT * FROM menu_categories WHERE active = 1 ORDER BY sort_order")).ToList();
        var items = (await connection.QueryAsync<menu_item_record>(
            """
            SELECT
                mi.*,
                mc.name AS category_name,
                COUNT(mii.id) AS recipe_count,
                CASE WHEN COUNT(mii.id) > 0 THEN 1 ELSE 0 END AS has_inventory_recipe,
                MIN(
                    CASE
                        WHEN mii.quantity_required IS NULL OR mii.quantity_required <= 0 THEN NULL
                        ELSE FLOOR(ii.current_stock / mii.quantity_required)
                    END
                ) AS available_stock_estimate,
                CASE
                    WHEN COUNT(mii.id) = 0 THEN 'none'
                    WHEN MIN(
                        CASE
                            WHEN mii.quantity_required IS NULL OR mii.quantity_required <= 0 THEN NULL
                            ELSE FLOOR(ii.current_stock / mii.quantity_required)
                        END
                    ) <= 0 THEN 'out'
                    WHEN MIN(
                        CASE
                            WHEN mii.quantity_required IS NULL OR mii.quantity_required <= 0 THEN NULL
                            ELSE FLOOR(ii.current_stock / mii.quantity_required)
                        END
                    ) <= 5 THEN 'low'
                    ELSE 'ok'
                END AS inventory_status
            FROM menu_items mi
            JOIN menu_categories mc ON mi.category_id = mc.id
            LEFT JOIN menu_item_inventory mii ON mi.id = mii.menu_item_id
            LEFT JOIN inventory_items ii ON ii.id = mii.inventory_item_id
            WHERE mi.active = 1
            GROUP BY mi.id
            ORDER BY mi.category_id, mi.name
            """)).ToList();

        var menu = categories.Select(category => new
        {
            category.id,
            category.name,
            category.icon,
            category.sort_order,
            category.active,
            items = items.Where(item => item.category_id == category.id)
        });

        return Ok(menu);
    }

    [HttpGet("menu-categories")]
    public async Task<IActionResult> GetCategories()
    {
        using var connection = _connectionFactory.CreateConnection();
        var categories = await connection.QueryAsync<menu_category_record>(
            "SELECT * FROM menu_categories WHERE active = 1 ORDER BY sort_order");
        return Ok(categories);
    }

    [Authorize(Roles = "admin")]
    [HttpPost("menu")]
    public async Task<IActionResult> CreateMenuItem([FromBody] menu_item_request request)
    {
        if (request.category_id is null || string.IsNullOrWhiteSpace(request.name) || request.price is null)
        {
            return ApiError("category_id, name, price là bắt buộc", 400);
        }

        using var connection = _connectionFactory.CreateConnection();
        var id = await connection.ExecuteScalarAsync<int>(@"
            INSERT INTO menu_items (category_id, name, price, unit, description, image_url)
            VALUES (@category_id, @name, @price, @unit, @description, @image_url);
            SELECT LAST_INSERT_ID();",
            new
            {
                category_id = request.category_id,
                name = request.name.Trim(),
                price = request.price,
                unit = string.IsNullOrWhiteSpace(request.unit) ? "cái" : request.unit.Trim(),
                description = string.IsNullOrWhiteSpace(request.description) ? null : request.description.Trim(),
                image_url = string.IsNullOrWhiteSpace(request.image_url) ? null : request.image_url.Trim()
            });

        var item = await connection.QueryFirstAsync<menu_item_record>(
            "SELECT * FROM menu_items WHERE id = @id",
            new { id });
        return StatusCode(201, item);
    }

    [Authorize(Roles = "admin")]
    [HttpPut("menu/{id:int}")]
    public async Task<IActionResult> UpdateMenuItem(int id, [FromBody] menu_item_request request)
    {
        using var connection = _connectionFactory.CreateConnection();
        await connection.ExecuteAsync(
            """
            UPDATE menu_items
            SET category_id = @category_id,
                name = @name,
                price = @price,
                unit = @unit,
                description = @description,
                image_url = @image_url
            WHERE id = @id
            """,
            new
            {
                id,
                category_id = request.category_id,
                name = request.name?.Trim(),
                price = request.price,
                unit = request.unit?.Trim(),
                description = string.IsNullOrWhiteSpace(request.description) ? null : request.description.Trim(),
                image_url = string.IsNullOrWhiteSpace(request.image_url) ? null : request.image_url.Trim()
            });
        var item = await connection.QueryFirstAsync<menu_item_record>(
            "SELECT * FROM menu_items WHERE id = @id",
            new { id });
        return Ok(item);
    }

    [Authorize(Roles = "admin")]
    [HttpDelete("menu/{id:int}")]
    public async Task<IActionResult> DeleteMenuItem(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        await connection.ExecuteAsync("UPDATE menu_items SET active = 0 WHERE id = @id", new { id });
        return Ok(new { message = "Đã xóa món" });
    }

    [Authorize(Roles = "admin")]
    [HttpGet("menu/{id:int}/recipe")]
    public async Task<IActionResult> GetMenuRecipe(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        var ingredients = await connection.QueryAsync<menu_recipe_record>(@"
            SELECT
                mii.*,
                ii.name AS inventory_item_name,
                ii.unit AS inventory_unit,
                ii.current_stock,
                ii.min_stock,
                ii.active
            FROM menu_item_inventory mii
            JOIN inventory_items ii ON ii.id = mii.inventory_item_id
            WHERE mii.menu_item_id = @menu_item_id
            ORDER BY ii.name",
            new { menu_item_id = id });

        return Ok(new { menu_item_id = id, ingredients });
    }

    [Authorize(Roles = "admin")]
    [HttpPut("menu/{id:int}/recipe")]
    public async Task<IActionResult> UpdateMenuRecipe(int id, [FromBody] menu_recipe_request request)
    {
        var normalizedIngredients = (request.ingredients ?? [])
            .Where(item => item.inventory_item_id.HasValue && item.quantity_required.HasValue && item.quantity_required.Value > 0)
            .Select(item => new
            {
                inventory_item_id = item.inventory_item_id!.Value,
                quantity_required = item.quantity_required!.Value
            })
            .DistinctBy(item => item.inventory_item_id)
            .ToList();

        using var connection = _connectionFactory.CreateConnection();
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        var exists = await connection.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM menu_items WHERE id = @id AND active = 1",
            new { id },
            transaction);
        if (exists == 0)
        {
            return ApiError("Món không tồn tại", 404);
        }

        await connection.ExecuteAsync(
            "DELETE FROM menu_item_inventory WHERE menu_item_id = @menu_item_id",
            new { menu_item_id = id },
            transaction);

        foreach (var ingredient in normalizedIngredients)
        {
            await connection.ExecuteAsync(@"
                INSERT INTO menu_item_inventory (menu_item_id, inventory_item_id, quantity_required)
                VALUES (@menu_item_id, @inventory_item_id, @quantity_required)",
                new
                {
                    menu_item_id = id,
                    ingredient.inventory_item_id,
                    ingredient.quantity_required
                },
                transaction);
        }

        transaction.Commit();
        return Ok(new { message = "Đã cập nhật công thức kho", ingredients = normalizedIngredients });
    }
}
