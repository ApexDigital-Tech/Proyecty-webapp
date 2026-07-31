import os
import re

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "app.patch('/api/projects/:id'"
end_marker = "app.use(errorHandler);"

start_idx = content.find(start_marker)
end_idx = content.rfind(end_marker)

# Keep the remaining parts for server.ts
new_server_content = content[:start_idx] + "\n" + content[end_idx:]

# Remove multer import and initialization
new_server_content = re.sub(r"import multer from 'multer';\n", "", new_server_content)
new_server_content = re.sub(r"// Initialize Multer.*?\}\);\n", "", new_server_content, flags=re.DOTALL)

# Add imports for uploadsRouter and legacyRouter
import_uploads = "import uploadsRouter from './src/routes/uploads.routes.ts';\n"
import_legacy = "import legacyRouter from './src/routes/legacy.routes.ts';\n"

# Add imports just after usersRouter import
users_import_idx = new_server_content.find("import usersRouter from './src/routes/users.routes.ts';")
if users_import_idx != -1:
    idx = new_server_content.find("\n", users_import_idx) + 1
    new_server_content = new_server_content[:idx] + import_uploads + import_legacy + new_server_content[idx:]

# Add app.use
app_use_projects_idx = new_server_content.find("app.use('/api/projects', projectsRouter);")
if app_use_projects_idx != -1:
    idx = new_server_content.find("\n", app_use_projects_idx) + 1
    new_server_content = new_server_content[:idx] + "app.use('/api', legacyRouter);\napp.use('/api', uploadsRouter);\n" + new_server_content[idx:]

with open('server.ts', 'w', encoding='utf-8') as f:
    f.write(new_server_content)

print("Cleaned server.ts")
