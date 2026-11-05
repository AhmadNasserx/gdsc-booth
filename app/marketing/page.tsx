/* eslint-disable @next/next/no-img-element -- static logos on a full-screen loop; next/image adds nothing here */
import type { Metadata } from 'next';
import Mosaic from '@/components/Mosaic';
import { MEMORY_EMOJIS } from '@/lib/memoryEmojis';
import styles from './marketing.module.css';
import SceneLoop from './SceneLoop';
import BoothSound from './BoothSound';
import { MARKETING_URL, getQrSvg } from './qr';

export const metadata: Metadata = {
  title: 'BAU Open Doors 2026 · Faculty of Science: Play and Win',
  description:
    'Three quick science and tech games, one leaderboard and a prize every 20 minutes at the Faculty of Science booth, BAU Open Doors 2026. Scan the code and play.',
};

/** Seconds into the Memory scene at which each pair is found, in board order. */
const MEMORY_BOARD = [0, 3, 5, 1, 2, 6, 0, 4, 7, 1, 3, 2, 4, 5, 6, 7];
const PAIR_AT = [0.5, 1.1, 1.7, 2.3, 2.9, 3.5, 4.1, 4.7];

const TICKER = [
  'A prize every 20 minutes for the top 3',
  'Check the leaderboard, ranks change all the time',
  'Questions in English or French',
  '3 games · 1 try each',
  'Scan the QR code to play',
];

function Tag({ children }: { children: React.ReactNode }) {
  return <span className={styles.tag}>{children}</span>;
}

function HookScene() {
  return (
    <div className={styles.hook}>
      <Tag>Faculty of Science · Open Doors 2026</Tag>
      <h1 className={styles.hero}>
        <span>The door is open.</span>
        <span>
          Are you ready<b className={styles.q}>?</b>
        </span>
      </h1>
      <p className={styles.lead}>Play 3 quick science games. The top 3 win a prize every 20 minutes.</p>
      <div className={styles.tiles}>
        {[
          ['🧩', 'Emoji Riddles'],
          ['🧠', 'Memory Match'],
          ['⚡', 'Tech Trivia'],
        ].map(([emoji, name], i) => (
          <div key={name} className={styles.tile} style={{ animationDelay: `${0.5 + i * 0.15}s` }}>
            <span className={styles.tileNo}>{`0${i + 1}`}</span>
            <span className={styles.tileEmoji}>{emoji}</span>
            <span className={styles.tileName}>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HowScene() {
  const steps = [
    ['Scan the QR code', 'Your phone camera is enough. Nothing to install.'],
    ['English or Français', 'Pick the language of your questions.'],
    ['Name, school, class', 'Choose a display name and tell us your school and class.'],
    ['Play 3 games', 'Emoji Riddles, Memory Match and Tech Trivia. Once each.'],
  ];
  return (
    <div className={styles.block}>
      <Tag>How it works</Tag>
      <h2 className={styles.title}>Four steps to play</h2>
      <ol className={styles.steps}>
        {steps.map(([title, caption], i) => (
          <li key={title} className={styles.step} style={{ animationDelay: `${0.3 + i * 0.35}s` }}>
            <span className={styles.stepNo}>{i + 1}</span>
            <h3 className={styles.stepTitle}>{title}</h3>
            <p className={styles.stepCaption}>{caption}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RiddleScene() {
  return (
    <div className={styles.split}>
      <div className={styles.copy}>
        <Tag>Game 1 of 3</Tag>
        <h2 className={styles.title}>Emoji Riddles</h2>
        <p className={styles.lead}>Read the emoji and the hint. Pick the word. 5 riddles, faster scores more.</p>
      </div>
      <div className={styles.phone}>
        <p className={styles.phoneTop}>Question 2 of 5</p>
        <div className={styles.emojiRow}>
          <span>🔬</span>
          <span>🔎</span>
          <span>🧫</span>
        </div>
        <p className={styles.hint}>Hint: Makes tiny things look much bigger</p>
        <div className={styles.options}>
          <span className={styles.option}>Periscope</span>
          <span className={styles.option}>Stethoscope</span>
          <span className={styles.option}>Kaleidoscope</span>
          <span className={`${styles.option} ${styles.optionRight}`}>Microscope</span>
        </div>
      </div>
    </div>
  );
}

function MemoryScene() {
  return (
    <div className={styles.split}>
      <div className={styles.copy}>
        <Tag>Game 2 of 3</Tag>
        <h2 className={styles.title}>Memory Match</h2>
        <p className={styles.lead}>Flip two cards at a time and find all 8 pairs. Fewer moves score more.</p>
      </div>
      <div className={styles.board} aria-hidden="true">
        {MEMORY_BOARD.map((pair, i) => (
          <div key={i} className={styles.card}>
            <div className={styles.cardInner} style={{ animationDelay: `${PAIR_AT[pair]}s` }}>
              <div className={`${styles.face} ${styles.faceDown}`}>?</div>
              <div className={`${styles.face} ${styles.faceUp}`} style={{ animationDelay: `${PAIR_AT[pair] + 0.5}s` }}>
                {MEMORY_EMOJIS[pair]}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TriviaScene() {
  return (
    <div className={styles.split}>
      <div className={styles.copy}>
        <Tag>Game 3 of 3</Tag>
        <h2 className={styles.title}>Tech Trivia</h2>
        <p className={styles.lead}>35 seconds. Right answers add points, wrong ones cost you. Build a streak.</p>
      </div>
      <div className={styles.phone}>
        <div className={styles.timer} aria-hidden="true">
          <span />
        </div>
        <p className={styles.question}>Which organelle is known as the powerhouse of the cell?</p>
        <div className={styles.answers}>
          <span className={styles.answer}>Nucleus</span>
          <span className={styles.answer}>Ribosome</span>
          <span className={styles.answer}>Vacuole</span>
          <span className={`${styles.answer} ${styles.answerRight}`}>Mitochondrion</span>
        </div>
        <p className={styles.streak}>x3 streak 🔥</p>
      </div>
    </div>
  );
}

function PrizeScene() {
  return (
    <div className={styles.split}>
      <div className={styles.copy}>
        <Tag>Prizes</Tag>
        <h2 className={styles.title}>A prize every 20 minutes</h2>
        <p className={styles.lead}>The top 3 players win every 20 minutes. Finish all 3 games to qualify.</p>
      </div>
      <div className={styles.podium} aria-hidden="true">
        {[
          ['🥈', 2, styles.p2],
          ['🥇', 1, styles.p1],
          ['🥉', 3, styles.p3],
        ].map(([medal, place, cls]) => (
          <div key={String(place)} className={styles.ped}>
            <span className={styles.medal}>{medal}</span>
            <div className={`${styles.block} ${cls}`}>{place}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeaderboardScene() {
  const rows = [
    ['ByteQueen', '3,102'],
    ['nour_lab', '2,987'],
    ['quantum', '2,954'],
    ['cedar_coder', '2,880'],
  ];
  return (
    <div className={styles.split}>
      <div className={styles.copy}>
        <Tag>Live</Tag>
        <h2 className={styles.title}>Check the leaderboard</h2>
        <p className={styles.lead}>Ranks change all the time. Watch the big screen to see if you are in the current top 3.</p>
      </div>
      <div className={styles.board2} aria-hidden="true">
        <p className={styles.boardHead}>
          <span>Live leaderboard</span>
          <span className={styles.live}>LIVE</span>
        </p>
        {rows.map(([name, score], i) => (
          <div key={name} className={`${styles.row} ${i === 1 ? styles.climber : ''}`}>
            <span className={styles.rank}>#{i + 1}</span>
            <span className={styles.rowName}>{name}</span>
            <span className={styles.rowScore}>{score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QrScene({ qrSvg }: { qrSvg: string }) {
  return (
    <div className={styles.qrScene}>
      <div className={styles.copy}>
        <Tag>Your turn</Tag>
        <h2 className={styles.title}>Scan now. Play in 3 minutes.</h2>
        <p className={styles.url}>{MARKETING_URL}</p>
        <p className={styles.lead}>Finish all 3 games to qualify for the prizes.</p>
      </div>
      <div className={styles.qrCard}>
        <div className={styles.qr} dangerouslySetInnerHTML={{ __html: qrSvg }} />
      </div>
    </div>
  );
}

export default async function MarketingPage() {
  const qrSvg = await getQrSvg();

  const scenes = [
    <HookScene key="hook" />,
    <HowScene key="how" />,
    <RiddleScene key="riddles" />,
    <MemoryScene key="memory" />,
    <TriviaScene key="trivia" />,
    <PrizeScene key="prizes" />,
    <LeaderboardScene key="leaderboard" />,
    <QrScene key="qr" qrSvg={qrSvg} />,
  ];

  return (
    <main className={styles.root}>
      <div className={styles.stage}>
        <Mosaic className={styles.mosaic} cols={30} rows={10} />

        <header className={styles.header}>
          <img src="/brand/bau-logo.png" alt="Beirut Arab University" className={styles.bau} />
          <span className={styles.rule} aria-hidden="true" />
          <img src="/brand/open-doors-2026.png" alt="Open Doors 2026" className={styles.doors} />
          <span className={styles.faculty}>Faculty of Science</span>
        </header>

        <SceneLoop scenes={scenes} durations={[6000, 6500, 6000, 6500, 6000, 6000, 6500, 8000]} staticIndex={7} />

        <aside className={styles.rail}>
          <div className={styles.railQr}>
            <div className={styles.qrSmall} dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <b>Scan to play</b>
          </div>
          <div className={styles.railPrize}>
            <span>🏆</span>
            <b>A prize every 20 minutes</b>
            <small>Top 3 every 20 minutes</small>
          </div>
          <div className={styles.railLive}>
            <span className={styles.liveTag}>
              <i /> LIVE
            </span>
            <b>Check the leaderboard</b>
          </div>
        </aside>

        <div className={styles.ticker} aria-hidden="true">
          <div className={styles.track}>
            {[0, 1].map((copy) => (
              <span key={copy} className={styles.seg}>
                {TICKER.map((line) => (
                  <span key={line}>
                    {line}
                    <i>◆</i>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>

        <BoothSound />
      </div>
    </main>
  );
}
