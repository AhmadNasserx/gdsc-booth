export interface Riddle {
  emojis: string;
  hint: string;
  options: string[];
  answer: string;
}

export const RIDDLE_POOL: Riddle[] = [
  { emojis: '🕷️ 🌐', hint: 'Scrapes and indexes the web', options: ['Web Crawler', 'Bug Bounty', 'Docker', 'Firewall'], answer: 'Web Crawler' },
  { emojis: '📦 🔄 🚢', hint: 'Containerization platform', options: ['Kubernetes', 'GitLab', 'Docker', 'Linux'], answer: 'Docker' },
  { emojis: '🔑 🔒 📜', hint: 'Encrypts web communication', options: ['SSL/TLS', 'DNS', 'HTTP', 'VPN'], answer: 'SSL/TLS' },
  { emojis: '🐍 💻 ⚡', hint: 'Popular scripting language named after a snake', options: ['Python', 'C++', 'JavaScript', 'Rust'], answer: 'Python' },
  { emojis: '☁️ 💾 🔄', hint: 'Store and sync files over the internet', options: ['Cloud Storage', 'USB Drive', 'RAM Cache', 'Blockchain'], answer: 'Cloud Storage' },
  { emojis: '🔍 🧠 📊', hint: 'Finds patterns in data automatically', options: ['Machine Learning', 'Web Scraping', 'SQL Query', 'Encryption'], answer: 'Machine Learning' },
  { emojis: '🌿 🔀 💻', hint: 'Isolates work in a separate codebase copy', options: ['Git Branch', 'Pull Request', 'Commit', 'Fork'], answer: 'Git Branch' },
  { emojis: '⚡ 🖥️ 🎮', hint: 'Massively parallel processing chip', options: ['GPU', 'CPU', 'RAM', 'SSD'], answer: 'GPU' },
  { emojis: '🧩 🔌 💻', hint: 'Lets applications talk to each other', options: ['API', 'IDE', 'CLI', 'DNS'], answer: 'API' },
  { emojis: '🔐 👤 ✅', hint: 'Confirms you are who you claim to be', options: ['Authentication', 'Encryption', 'Firewall', 'VPN'], answer: 'Authentication' },
];

export interface TriviaQuestion {
  question: string;
  options: string[];
  answer: string;
}

export const TRIVIA_POOL: TriviaQuestion[] = [
  { question: "What does 'GDSC' stand for?", options: ['Google Developer Student Clubs', 'Global Data Science Center', 'General Developer Software Council', 'Google Design & Code'], answer: 'Google Developer Student Clubs' },
  { question: 'Which Google framework builds cross-platform mobile apps from one codebase?', options: ['Flutter', 'React Native', 'Angular', 'Kotlin Multiplatform'], answer: 'Flutter' },
  { question: "What is Google's flagship AI model family?", options: ['Gemini', 'Llama', 'Claude', 'GPT-4'], answer: 'Gemini' },
  { question: 'What does CSS stand for?', options: ['Cascading Style Sheets', 'Creative Style Software', 'Computer Screen Styling', 'Cascading Script System'], answer: 'Cascading Style Sheets' },
  { question: 'What does "API" stand for?', options: ['Application Programming Interface', 'Automated Process Integration', 'App Protocol Input', 'Archived Program Index'], answer: 'Application Programming Interface' },
  { question: 'Which company originally developed Kubernetes?', options: ['Google', 'Microsoft', 'Amazon', 'Meta'], answer: 'Google' },
  { question: 'What data format is most commonly used in web APIs?', options: ['JSON', 'XML', 'CSV', 'YAML'], answer: 'JSON' },
  { question: 'What does "HTML" stand for?', options: ['HyperText Markup Language', 'High Transfer Machine Learning', 'Hosted Text Management Layer', 'HyperText Management Link'], answer: 'HyperText Markup Language' },
  { question: 'What does "IDE" stand for?', options: ['Integrated Development Environment', 'Internal Data Engine', 'Interface Design Element', 'Indexed Deployment Engine'], answer: 'Integrated Development Environment' },
  { question: 'Which version control platform hosts the most open-source repositories?', options: ['GitHub', 'GitLab', 'Bitbucket', 'SourceForge'], answer: 'GitHub' },
];

export function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}
