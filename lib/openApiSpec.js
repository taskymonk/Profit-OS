export function getOpenApiSpec(baseUrl) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Profit OS — Public API',
      version: '1.0.0',
      description: `Welcome to the **Profit OS Public API**. This API provides read and write access to your e-commerce profitability data.\n\n## Authentication\nAll requests require an API key passed in the \`X-API-Key\` header.\n\n\`\`\`\ncurl -H "X-API-Key: pos_your_key_here" ${baseUrl}/api/v1/orders\n\`\`\`\n\n## Rate Limiting\nDefault: **100 requests/minute** per API key. Contact admin to increase.\n\n## Response Format\nAll responses follow:\n\`\`\`json\n{\n  "success": true,\n  "data": { ... },\n  "meta": { "page": 1, "limit": 50, "total": 100 }\n}\n\`\`\``,
      contact: { name: 'Profit OS Support' },
    },
    servers: [
      { url: baseUrl, description: 'Current Server' },
    ],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Your Profit OS API key. Generate one from Settings → API.',
        },
      },
      schemas: {
        Order: {
          type: 'object',
          properties: {
            _id: { type: 'string', description: 'Unique order ID' },
            orderId: { type: 'string', description: 'Display order ID (e.g., SH-1234)' },
            customerName: { type: 'string' },
            customerEmail: { type: 'string' },
            status: { type: 'string', enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'RTO', 'Cancelled', 'Refunded'] },
            orderDate: { type: 'string', format: 'date-time' },
            totalPrice: { type: 'number', description: 'Total order price' },
            lineItems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  quantity: { type: 'integer' },
                  salePrice: { type: 'number' },
                  sku: { type: 'string' },
                },
              },
            },
            shippingCost: { type: 'number' },
            trackingNumber: { type: 'string' },
            carrier: { type: 'string' },
            isRTO: { type: 'boolean' },
            financialStatus: { type: 'string' },
          },
        },
        OrderProfit: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            orderId: { type: 'string' },
            grossRevenue: { type: 'number' },
            netRevenue: { type: 'number' },
            totalCOGS: { type: 'number' },
            shippingCost: { type: 'number' },
            transactionFees: { type: 'number' },
            marketingAllocation: { type: 'number' },
            netProfit: { type: 'number' },
            profitMargin: { type: 'number' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            sku: { type: 'string' },
            ingredients: { type: 'array', items: { type: 'object' } },
            totalCost: { type: 'number' },
            category: { type: 'string' },
          },
        },
        Expense: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            expenseName: { type: 'string' },
            category: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string' },
            frequency: { type: 'string', enum: ['recurring', 'one-time'] },
          },
        },
        DashboardMetrics: {
          type: 'object',
          properties: {
            totalOrders: { type: 'integer' },
            revenue: { type: 'number' },
            grossOrderProfit: { type: 'number' },
            netProfit: { type: 'number' },
            adSpend: { type: 'number' },
            rtoRate: { type: 'number' },
            avgOrderValue: { type: 'number' },
            profitMargin: { type: 'number' },
          },
        },
        Bill: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            vendor: { type: 'string' },
            category: { type: 'string' },
            amount: { type: 'number' },
            taxAmount: { type: 'number' },
            dueDate: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['pending', 'partial', 'paid', 'overdue'] },
            payments: { type: 'array', items: { type: 'object' } },
          },
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            meta: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
              },
            },
            error: { type: 'string' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
          },
        },
      },
    },
    paths: {
      '/api/v1/orders': {
        get: {
          tags: ['Orders'],
          summary: 'List orders',
          description: 'Retrieve a paginated list of orders with optional filters.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 }, description: 'Results per page (max 200)' },
            { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by order status' },
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by order ID or customer name' },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date (YYYY-MM-DD)' },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date (YYYY-MM-DD)' },
            { name: 'sort', in: 'query', schema: { type: 'string', default: '-orderDate' }, description: 'Sort field (prefix - for desc)' },
          ],
          responses: {
            200: {
              description: 'Paginated list of orders',
              content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiResponse' }, { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Order' } } } }] } } },
            },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            429: { description: 'Rate limit exceeded' },
          },
        },
      },
      '/api/v1/orders/{id}': {
        get: {
          tags: ['Orders'],
          summary: 'Get order by ID',
          description: 'Retrieve a specific order by its ID, including profit breakdown.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Order ID' }],
          responses: {
            200: { description: 'Order details with profit data', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiResponse' }, { properties: { data: { $ref: '#/components/schemas/OrderProfit' } } }] } } } },
            404: { description: 'Order not found' },
          },
        },
      },
      '/api/v1/products': {
        get: {
          tags: ['Products'],
          summary: 'List SKU recipes',
          description: 'Retrieve all SKU recipes with ingredients and cost breakdown.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by name or SKU' },
          ],
          responses: {
            200: { description: 'List of products', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiResponse' }, { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Product' } } } }] } } } },
          },
        },
      },
      '/api/v1/products/{id}': {
        get: {
          tags: ['Products'],
          summary: 'Get product by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Product details' },
            404: { description: 'Product not found' },
          },
        },
      },
      '/api/v1/expenses': {
        get: {
          tags: ['Expenses'],
          summary: 'List expenses',
          description: 'Retrieve all overhead expenses.',
          parameters: [
            { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Filter by category' },
            { name: 'frequency', in: 'query', schema: { type: 'string', enum: ['recurring', 'one-time'] } },
          ],
          responses: {
            200: { description: 'List of expenses', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiResponse' }, { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Expense' } } } }] } } } },
          },
        },
      },
      '/api/v1/dashboard': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get dashboard metrics',
          description: 'Retrieve aggregated business metrics for a date range.',
          parameters: [
            { name: 'range', in: 'query', schema: { type: 'string', enum: ['today', '7days', 'month', 'alltime', 'custom'], default: '7days' } },
            { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' }, description: 'For custom range' },
            { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' }, description: 'For custom range' },
          ],
          responses: {
            200: { description: 'Dashboard metrics', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiResponse' }, { properties: { data: { $ref: '#/components/schemas/DashboardMetrics' } } }] } } } },
          },
        },
      },
      '/api/v1/finance/bills': {
        get: {
          tags: ['Finance'],
          summary: 'List bills',
          description: 'Retrieve all bills with payment status.',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'partial', 'paid', 'overdue'] } },
          ],
          responses: {
            200: { description: 'List of bills', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiResponse' }, { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Bill' } } } }] } } } },
          },
        },
      },
      '/api/v1/finance/vendors': {
        get: {
          tags: ['Finance'],
          summary: 'List vendors',
          description: 'Retrieve all vendor records.',
          responses: { 200: { description: 'List of vendors' } },
        },
      },
      '/api/v1/inventory': {
        get: {
          tags: ['Inventory'],
          summary: 'List inventory items',
          description: 'Retrieve all inventory items with cost data.',
          parameters: [
            { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Filter by category' },
          ],
          responses: { 200: { description: 'List of inventory items' } },
        },
      },
      '/api/v1/employees': {
        get: {
          tags: ['Employees'],
          summary: 'List employees',
          description: 'Retrieve all employees with KDS performance data.',
          responses: { 200: { description: 'List of employees' } },
        },
      },
    },
    tags: [
      { name: 'Orders', description: 'Order management and profit analysis' },
      { name: 'Products', description: 'SKU recipes and product catalog' },
      { name: 'Expenses', description: 'Overhead expense tracking' },
      { name: 'Dashboard', description: 'Aggregated business metrics' },
      { name: 'Finance', description: 'Bills, vendors, and cash flow' },
      { name: 'Inventory', description: 'Inventory and stock management' },
      { name: 'Employees', description: 'Employee and KDS data' },
    ],
  };
}
