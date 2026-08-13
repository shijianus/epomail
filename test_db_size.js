import Database from 'better-sqlite3';
const db = new Database(':memory:');
const size = db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get();
console.log(size);
