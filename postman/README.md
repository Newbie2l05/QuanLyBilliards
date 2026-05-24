# Postman files

Import file:

- `postman/BidaCSharp-Table-Payment.postman_collection.json`

Use:

1. Start the API.
2. Import the collection into Postman.
3. If your app is not running at `http://localhost:5000`, change collection variable `base_url`.
4. Run `00 - Dang nhap admin` first.
5. Run folder `01 - Quan ly ban` or `02 - Thanh toan`.

Notes:

- The collection uses admin credentials from collection variables: `admin` / `Password@123`.
- Most endpoints require JWT, so the login request stores `token` into collection variables automatically.
- The payment flow creates its own test table, starts a session, pays that session, then deletes the test table.
