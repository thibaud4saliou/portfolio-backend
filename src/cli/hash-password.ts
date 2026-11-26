import { hashPassword } from '../lib/auth';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Usage : npm run hash-password -- "mot-de-passe-d-au-moins-12-caracteres"');
  process.exit(1);
}
console.log(hashPassword(password));
