# URL Shortener Course — 01: Project Setup

## Goal

Create and run a new NestJS application. We will configure TypeORM, PostgreSQL and Vitest after reviewing the generated configuration.

You write and run the code yourself. Share configuration, results and errors for review before moving to the next lesson.

## 1. Check your versions

Run:

```bash
node --version
npm --version
npm view @nestjs/cli version
npm view @nestjs/core version
```

Keep the output for review. We will check compatible package versions before adding database and testing configuration.

## 2. Scaffold the application

An empty `url-shortener` folder has already been created beside `basic-api`:

```text
/Users/codewarrior/nestjs-class/
├── basic-api/
└── url-shortener/
```

From the parent directory, run:

```bash
cd /Users/codewarrior/nestjs-class
npx @nestjs/cli@latest new url-shortener --package-manager npm
```

If offered optional observability integration, skip it for now. If the CLI reports a conflict, share the error before changing or deleting files.

Like `laravel new`, the Nest CLI generates the initial application structure and installs dependencies. We will inspect its defaults before adapting them for this course.

## 3. Start the application

```bash
cd url-shortener
npm run start:dev
```

Visit <http://localhost:3000>. You should see `Hello World!`.

Leave the generated tests in place for now. We will replace their configuration with Vitest together.

## 4. Submit for review

Paste the following into the course chat:

- Output of the four version commands.
- Generated `package.json`.
- Generated `tsconfig.json`.
- Whether `Hello World!` appears, or the complete error you encounter.

Do not include secrets or `.env` values.

## Completion checklist

- [ ] Version information collected.
- [ ] NestJS project scaffolded.
- [ ] Development server starts successfully.
- [ ] Browser displays `Hello World!`.
- [ ] Configuration and results shared for review.

## Next lesson

Review the generated configuration, establish native ESM deliberately, and configure Vitest. Then connect PostgreSQL through TypeORM using migrations and a separate test database.
