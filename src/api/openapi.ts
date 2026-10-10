export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "IntelliClass API",
    version: "1.0.0",
    description:
      "Versioned API for IntelliClass institutions, accounts, classes, subjects, classroom sessions, and attendance.",
  },
  servers: [{ url: "/api/v1", description: "Current API host" }],
  tags: [
    { name: "Health" },
    { name: "Authentication" },
    { name: "Institutions" },
    { name: "Users" },
    { name: "Students" },
    { name: "Teachers" },
    { name: "Classes" },
    { name: "Subjects" },
    { name: "Sessions" },
    { name: "Dashboard" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      refreshCookie: {
        type: "apiKey",
        in: "cookie",
        name: "ic_session",
        description: "HttpOnly refresh-session cookie set by login and refresh.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              requestId: { type: "string" },
            },
            required: ["code", "message"],
          },
        },
        required: ["error"],
      },
      Pagination: {
        type: "object",
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer", maximum: 100 },
          total: { type: "integer" },
          totalPages: { type: "integer" },
        },
        required: ["page", "pageSize", "total", "totalPages"],
      },
      UserRole: {
        type: "string",
        enum: ["SUPER_ADMIN", "INSTITUTION_ADMIN", "TEACHER", "STUDENT"],
      },
    },
    responses: {
      Unauthorized: {
        description: "Authentication is missing, invalid, expired, or revoked.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Forbidden: {
        description: "The authenticated role or institution is not authorized for this operation.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      ValidationError: {
        description: "The request failed validation.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
  paths: {
    "/healthz": {
      servers: [{ url: "/" }],
      get: {
        tags: ["Health"],
        summary: "Check API and PostgreSQL availability",
        responses: {
          "200": { description: "Healthy" },
          "503": { description: "Database unavailable" },
        },
      },
    },
    "/dashboard/summary": {
      get: {
        tags: ["Dashboard"],
        summary: "Read real, role-scoped institution and attendance metrics",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Database-backed dashboard summary" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Sign in with an institution-provisioned account",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", format: "password" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Access token returned; refresh cookie set" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Authentication"],
        summary: "Rotate the refresh session and issue a new access token",
        security: [{ refreshCookie: [] }],
        responses: {
          "200": { description: "Session rotated" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Authentication"],
        summary: "Revoke the refresh session",
        security: [{ refreshCookie: [] }],
        responses: { "204": { description: "Signed out" } },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Authentication"],
        summary: "Read the authenticated account",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Current user" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/forgot-password": {
      post: {
        tags: ["Authentication"],
        summary: "Request a password-reset email",
        description: "Returns 503 until an email-delivery provider is configured.",
        responses: { "503": { description: "Email delivery not configured" } },
      },
    },
    "/auth/reset-password": {
      post: {
        tags: ["Authentication"],
        summary: "Use a single-use reset token to change a password and revoke sessions",
        responses: {
          "204": { description: "Password changed" },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/institutions": {
      get: {
        tags: ["Institutions"],
        summary: "List institutions",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated institution list" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Institutions"],
        summary: "Create an institution",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Institution created" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/users": {
      get: {
        tags: ["Users"],
        summary: "List institution-scoped accounts",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated user list" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Users"],
        summary: "Provision an institution administrator, teacher, or student account",
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "User created; password hash is never returned" } },
      },
    },
    "/users/{id}": {
      patch: {
        tags: ["Users"],
        summary: "Update an account's email or name",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Updated account" },
          "404": { description: "Account not found in scope" },
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Deactivate an account and revoke its sessions",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "204": { description: "Account deactivated" },
          "404": { description: "Account not found in scope" },
        },
      },
    },
    "/students": {
      get: {
        tags: ["Students"],
        summary: "List student accounts",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated student list" } },
      },
      post: {
        tags: ["Students"],
        summary: "Provision a student account",
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Student created" } },
      },
    },
    "/teachers": {
      get: {
        tags: ["Teachers"],
        summary: "List teacher accounts",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated teacher list" } },
      },
      post: {
        tags: ["Teachers"],
        summary: "Provision a teacher account",
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Teacher created" } },
      },
    },
    "/classes": {
      get: {
        tags: ["Classes"],
        summary: "List classes visible to the current account",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated class list" } },
      },
      post: {
        tags: ["Classes"],
        summary: "Create a class with validated teacher and subject assignments",
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Class created" } },
      },
    },
    "/classes/{id}": {
      get: {
        tags: ["Classes"],
        summary: "Read a class if the current account is assigned or enrolled",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Class details" },
          "404": { description: "Class not found in the current scope" },
        },
      },
      patch: {
        tags: ["Classes"],
        summary: "Update a class or its institution-scoped assignments",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Updated class" },
          "404": { description: "Class not found in scope" },
        },
      },
      delete: {
        tags: ["Classes"],
        summary: "Delete a class only when it has no recorded sessions",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "204": { description: "Class deleted" },
          "409": { description: "Session history prevents deletion" },
        },
      },
    },
    "/classes/{id}/enrollments": {
      get: {
        tags: ["Classes"],
        summary: "List enrolled students",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { "200": { description: "Paginated enrollment list" } },
      },
      post: {
        tags: ["Classes"],
        summary: "Enroll active students from the same institution",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { "201": { description: "Students enrolled" } },
      },
    },
    "/subjects": {
      get: {
        tags: ["Subjects"],
        summary: "List subjects visible to the current account",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated subject list" } },
      },
      post: {
        tags: ["Subjects"],
        summary: "Create an institution subject",
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Subject created" } },
      },
    },
    "/sessions": {
      get: {
        tags: ["Sessions"],
        summary: "List sessions visible to the current account",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated session list" } },
      },
      post: {
        tags: ["Sessions"],
        summary: "Schedule a session for an assigned teacher, class, and subject",
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Session scheduled" } },
      },
    },
    "/sessions/{id}": {
      get: {
        tags: ["Sessions"],
        summary: "Read a session visible to the current account",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Session details" },
          "404": { description: "Session not found in the current scope" },
        },
      },
    },
    "/sessions/{id}/start": {
      post: {
        tags: ["Sessions"],
        summary: "Start a scheduled session if class and teacher are available",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Session started" },
          "409": { description: "Invalid transition or active-session conflict" },
        },
      },
    },
    "/sessions/{id}/end": {
      post: {
        tags: ["Sessions"],
        summary: "End an active session",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Session ended" },
          "409": { description: "Session is not active" },
        },
      },
    },
    "/sessions/{id}/attendance": {
      get: {
        tags: ["Sessions"],
        summary: "Read attendance; students receive only their own record",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { "200": { description: "Attendance records" } },
      },
      put: {
        tags: ["Sessions"],
        summary: "Create or update attendance for enrolled students",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Attendance saved" },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
  },
} as const;
