import os

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

imports = """
import authRouter from './src/routes/auth.routes.ts';
import usersRouter from './src/routes/users.routes.ts';
import reportsRouter from './src/routes/reports.routes.ts';
import { apiLimiter, authLimiter } from './src/middlewares/rateLimiter.ts';
import { errorHandler } from './src/middlewares/errorHandler.ts';
"""

content = content.replace("import documentsRouter from './src/routes/documents.ts';", "import documentsRouter from './src/routes/documents.ts';" + imports)

middlewares = """
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

app.use('/api', authRouter);
app.use('/api', usersRouter);
app.use('/api', reportsRouter);
"""

content = content.replace("app.use('/api', documentsRouter);", "app.use('/api', documentsRouter);" + middlewares)

# Add error handler at the end of routes
error_handler = """
app.use(errorHandler);
"""
content = content.replace("  if (process.env.NODE_ENV !== 'production') {", error_handler + "\n  if (process.env.NODE_ENV !== 'production') {")

with open('server.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Added routes and middlewares')
