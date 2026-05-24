using BidaCSharp.Models;
using Dapper;

namespace BidaCSharp.Services;

public sealed class InventoryService
{
    public async Task ApplyOrderDeltaAsync(
        System.Data.IDbConnection connection,
        System.Data.IDbTransaction transaction,
        int menuItemId,
        int quantityDelta,
        int? createdBy,
        string referenceType,
        int? referenceId,
        string? note = null)
    {
        if (quantityDelta == 0)
        {
            return;
        }

        var recipes = (await connection.QueryAsync<menu_recipe_record>(@"
            SELECT
                mii.id,
                mii.menu_item_id,
                mii.inventory_item_id,
                mii.quantity_required,
                ii.name AS inventory_item_name,
                ii.unit AS inventory_unit,
                ii.current_stock,
                ii.min_stock,
                ii.active
            FROM menu_item_inventory mii
            JOIN inventory_items ii ON ii.id = mii.inventory_item_id
            WHERE mii.menu_item_id = @menu_item_id AND ii.active = 1",
            new { menu_item_id = menuItemId },
            transaction)).ToList();

        foreach (var recipe in recipes)
        {
            var requiredQuantity = recipe.quantity_required * quantityDelta;
            var beforeStock = recipe.current_stock;
            var afterStock = beforeStock - requiredQuantity;

            if (quantityDelta > 0 && afterStock < 0)
            {
                throw new InvalidOperationException($"Kho không đủ cho nguyên liệu \"{recipe.inventory_item_name}\".");
            }

            await connection.ExecuteAsync(
                "UPDATE inventory_items SET current_stock = @current_stock WHERE id = @id",
                new
                {
                    current_stock = afterStock,
                    id = recipe.inventory_item_id
                },
                transaction);

            await connection.ExecuteAsync(@"
                INSERT INTO inventory_transactions (
                    inventory_item_id, transaction_type, quantity_change, stock_before, stock_after,
                    reference_type, reference_id, note, created_by)
                VALUES (
                    @inventory_item_id, @transaction_type, @quantity_change, @stock_before, @stock_after,
                    @reference_type, @reference_id, @note, @created_by)",
                new
                {
                    inventory_item_id = recipe.inventory_item_id,
                    transaction_type = quantityDelta > 0 ? "sale" : "order_revert",
                    quantity_change = -requiredQuantity,
                    stock_before = beforeStock,
                    stock_after = afterStock,
                    reference_type = referenceType,
                    reference_id = referenceId,
                    note,
                    created_by = createdBy
                },
                transaction);
        }
    }

    public async Task RestockOrderAsync(
        System.Data.IDbConnection connection,
        System.Data.IDbTransaction transaction,
        int orderId,
        int? createdBy,
        string referenceType,
        int? referenceId,
        string? note = null)
    {
        var items = await connection.QueryAsync<order_item_record>(
            "SELECT * FROM order_items WHERE order_id = @order_id",
            new { order_id = orderId },
            transaction);

        foreach (var item in items)
        {
            await ApplyOrderDeltaAsync(connection, transaction, item.menu_item_id, -item.quantity, createdBy, referenceType, referenceId, note);
        }
    }
}
