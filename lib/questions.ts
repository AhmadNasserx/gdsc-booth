export interface Riddle {
  emojis: string;
  hint: string;
  options: string[];
  answer: string;
}

export const RIDDLE_POOL: Riddle[] = [
  // ── Tech concepts ──────────────────────────────────────────────────────────
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
  { emojis: '🌐 📄 ✏️', hint: 'Markup language that structures web pages', options: ['HTML', 'CSS', 'JavaScript', 'Python'], answer: 'HTML' },
  { emojis: '🐛 🔍 🔧', hint: 'Finding and fixing errors in code', options: ['Debugging', 'Compiling', 'Refactoring', 'Testing'], answer: 'Debugging' },
  { emojis: '🔁 🪆', hint: 'A function that calls itself', options: ['Recursion', 'Loop', 'Iteration', 'Stack Overflow'], answer: 'Recursion' },
  { emojis: '🗄️ 🔍 📊', hint: 'Organized collection of structured data', options: ['Database', 'Spreadsheet', 'File System', 'Cache'], answer: 'Database' },
  { emojis: '🔒 🧱 🚫', hint: 'Blocks unauthorized network access', options: ['Firewall', 'VPN', 'Antivirus', 'Proxy'], answer: 'Firewall' },
  { emojis: '🏗️ 🧩 📐', hint: 'Pre-built structure for software development', options: ['Framework', 'Library', 'SDK', 'Plugin'], answer: 'Framework' },
  { emojis: '🔄 ↩️ 📝', hint: 'Tracks and manages code changes over time', options: ['Version Control', 'Backup', 'Logging', 'Caching'], answer: 'Version Control' },
  { emojis: '☁️ ⚡ 🚫🖥️', hint: 'Run code without managing servers', options: ['Serverless', 'Edge Computing', 'Docker', 'Kubernetes'], answer: 'Serverless' },
  { emojis: '📡 🔢 🌐', hint: 'Unique address that identifies a device on a network', options: ['IP Address', 'MAC Address', 'DNS Record', 'Port Number'], answer: 'IP Address' },
  { emojis: '🤖 💬 🧠', hint: 'Simulates human conversation using AI', options: ['Chatbot', 'Voice Assistant', 'Search Engine', 'Compiler'], answer: 'Chatbot' },
  // ── General knowledge ──────────────────────────────────────────────────────
  { emojis: '☕ 🫘 🌍', hint: 'Hot beverage brewed from roasted beans', options: ['Coffee', 'Tea', 'Cocoa', 'Juice'], answer: 'Coffee' },
  { emojis: '🌊 🏖️ ☀️', hint: 'Sandy shore where the sea meets the land', options: ['Beach', 'Desert', 'Island', 'Valley'], answer: 'Beach' },
  { emojis: '📱 📸 ❤️', hint: 'Photo-sharing social media platform', options: ['Instagram', 'TikTok', 'Snapchat', 'Pinterest'], answer: 'Instagram' },
  { emojis: '🎬 🍿 🎭', hint: 'A story told through moving images with sound', options: ['Movie', 'Book', 'Podcast', 'Play'], answer: 'Movie' },
  { emojis: '🧬 🔬 🧫', hint: 'The science of living organisms', options: ['Biology', 'Chemistry', 'Physics', 'Astronomy'], answer: 'Biology' },
  { emojis: '⚽ 🥅 🏟️', hint: "World's most popular sport", options: ['Football', 'Basketball', 'Tennis', 'Cricket'], answer: 'Football' },
  { emojis: '✈️ 🗺️ 🌍', hint: 'Exploring new countries and places', options: ['Travel', 'Migration', 'Commute', 'Adventure'], answer: 'Travel' },
  { emojis: '🎵 🎸 🥁', hint: 'Genre featuring electric guitars and a strong beat', options: ['Rock Music', 'Jazz', 'Classical', 'Pop'], answer: 'Rock Music' },
  { emojis: '🧑‍🍳 🍽️ ⭐', hint: 'Preparing delicious food from raw ingredients', options: ['Cooking', 'Baking', 'Grilling', 'Catering'], answer: 'Cooking' },
  { emojis: '📚 ✏️ 🏛️', hint: 'A place of higher education and research', options: ['University', 'School', 'Library', 'Office'], answer: 'University' },
];

export interface TriviaQuestion {
  question: string;
  options: string[];
  answer: string;
}

export const TRIVIA_POOL: TriviaQuestion[] = [
  // ── GDSC / Google ──────────────────────────────────────────────────────────
  { question: "What does 'GDSC' stand for?", options: ['Google Developer Student Clubs', 'Global Data Science Center', 'General Developer Software Council', 'Google Design & Code'], answer: 'Google Developer Student Clubs' },
  { question: 'Which Google framework builds cross-platform mobile apps from one codebase?', options: ['Flutter', 'React Native', 'Angular', 'Kotlin Multiplatform'], answer: 'Flutter' },
  { question: "What is Google's flagship AI model family?", options: ['Gemini', 'Llama', 'Claude', 'GPT-4'], answer: 'Gemini' },
  { question: 'Which company originally developed Kubernetes?', options: ['Google', 'Microsoft', 'Amazon', 'Meta'], answer: 'Google' },
  // ── Web / CS fundamentals ──────────────────────────────────────────────────
  { question: 'What does CSS stand for?', options: ['Cascading Style Sheets', 'Creative Style Software', 'Computer Screen Styling', 'Cascading Script System'], answer: 'Cascading Style Sheets' },
  { question: 'What does "API" stand for?', options: ['Application Programming Interface', 'Automated Process Integration', 'App Protocol Input', 'Archived Program Index'], answer: 'Application Programming Interface' },
  { question: 'What data format is most commonly used in web APIs?', options: ['JSON', 'XML', 'CSV', 'YAML'], answer: 'JSON' },
  { question: 'What does "HTML" stand for?', options: ['HyperText Markup Language', 'High Transfer Machine Learning', 'Hosted Text Management Layer', 'HyperText Management Link'], answer: 'HyperText Markup Language' },
  { question: 'What does "IDE" stand for?', options: ['Integrated Development Environment', 'Internal Data Engine', 'Interface Design Element', 'Indexed Deployment Engine'], answer: 'Integrated Development Environment' },
  { question: 'Which version control platform hosts the most open-source repositories?', options: ['GitHub', 'GitLab', 'Bitbucket', 'SourceForge'], answer: 'GitHub' },
  { question: 'What does "RAM" stand for?', options: ['Random Access Memory', 'Read-All Memory', 'Runtime Application Mode', 'Rapid Action Module'], answer: 'Random Access Memory' },
  { question: 'What does "HTTP" stand for?', options: ['HyperText Transfer Protocol', 'High-Traffic Transmission Protocol', 'Hosted Text Transfer Process', 'HyperThread Typing Protocol'], answer: 'HyperText Transfer Protocol' },
  { question: 'What does "SQL" stand for?', options: ['Structured Query Language', 'System Query Logic', 'Standard Queue Link', 'Stored Query Layer'], answer: 'Structured Query Language' },
  { question: 'In what year was the World Wide Web invented by Tim Berners-Lee?', options: ['1983', '1989', '1995', '2001'], answer: '1989' },
  { question: 'Which company created the Android operating system?', options: ['Google', 'Apple', 'Microsoft', 'Samsung'], answer: 'Google' },
  // ── General knowledge ──────────────────────────────────────────────────────
  { question: 'What is the capital city of France?', options: ['Paris', 'London', 'Berlin', 'Rome'], answer: 'Paris' },
  { question: 'How many players are on a football (soccer) team?', options: ['11', '10', '9', '12'], answer: '11' },
  { question: 'What is the fastest land animal?', options: ['Cheetah', 'Lion', 'Leopard', 'Horse'], answer: 'Cheetah' },
  { question: 'In which year did World War II end?', options: ['1945', '1939', '1944', '1950'], answer: '1945' },
  { question: 'How many continents are there on Earth?', options: ['7', '5', '6', '8'], answer: '7' },
  { question: 'What is the common name for H₂O?', options: ['Water', 'Hydrogen', 'Oxygen', 'Salt'], answer: 'Water' },
  { question: 'Who wrote Romeo and Juliet?', options: ['Shakespeare', 'Dickens', 'Hemingway', 'Twain'], answer: 'Shakespeare' },
  { question: 'Which planet is closest to the Sun?', options: ['Mercury', 'Venus', 'Earth', 'Mars'], answer: 'Mercury' },
  { question: 'What color do you get when you mix red and blue?', options: ['Purple', 'Green', 'Orange', 'Brown'], answer: 'Purple' },
  { question: 'What is the chemical symbol for Gold?', options: ['Au', 'Go', 'Gd', 'Gl'], answer: 'Au' },
  { question: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], answer: '6' },
  { question: 'Which planet is known as the Red Planet?', options: ['Mars', 'Venus', 'Jupiter', 'Saturn'], answer: 'Mars' },
  { question: 'Who painted the Mona Lisa?', options: ['Leonardo da Vinci', 'Michelangelo', 'Raphael', 'Picasso'], answer: 'Leonardo da Vinci' },
  { question: 'What is the largest ocean on Earth?', options: ['Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'], answer: 'Pacific Ocean' },
];

export function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}
