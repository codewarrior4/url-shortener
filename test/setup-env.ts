// Set before AppModule is imported. This is a placeholder, not a live DB connection.
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_URL =
  'postgresql://test_user:test_password@localhost:5432/url_shortener_test';
