import type { Metadata } from 'next';
import styles from './marketing.module.css';
import SceneLoop from './SceneLoop';
import { MARKETING_URL, getQrSvg } from './qr';

export const metadata: Metadata = {
  title: 'BAU Tripoli Open House: Play and Win',
  description:
    'Three quick tech mini-games, one leaderboard and a prize every hour at the BAU Tripoli Open House. Scan the code and play.',
};

const MEMORY_EMOJI = ['🚀', '🎯', '💡', '🧩', '🔥', '⭐', '🚀', '🎯', '💡', '🧩', '🔥', '⭐'];

const MEMORY_DELAY: Record<string, number> = {
  '🚀': 0.6,
  '🎯': 1.4,
  '💡': 2.2,
  '🧩': 3.0,
  '🔥': 3.8,
  '⭐': 4.6,
};

function Badge({ qrSvg }: { qrSvg: string }) {
  return (
    <div className={styles.badge}>
      <div className={styles.badgeQr} dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <span>Scan to play</span>
    </div>
  );
}

function HookScene({ qrSvg }: { qrSvg: string }) {
  return (
    <>
      <p className={styles.eyebrow}>BAU Tripoli Open House</p>
      <h1 className={styles.hero}>{"Think you're the smartest in the room?"}</h1>
      <p className={styles.lead}>Three quick games. One leaderboard. A prize every hour.</p>
      <div className={styles.dots} aria-hidden="true">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
      <p className={styles.footerNote}>GDG on Campus BAU Tripoli</p>
      <Badge qrSvg={qrSvg} />
    </>
  );
}

function HowScene({ qrSvg }: { qrSvg: string }) {
  return (
    <>
      <h2 className={styles.title}>How it works</h2>
      <div className={styles.steps}>
        <div className={styles.step}>
          <span className={styles.stepNumber}>1</span>
          <h3 className={styles.stepTitle}>Scan the QR code</h3>
          <p className={styles.stepCaption}>Use your phone camera. Nothing to install.</p>
        </div>
        <div className={styles.step}>
          <span className={styles.stepNumber}>2</span>
          <h3 className={styles.stepTitle}>Enter your name</h3>
          <p className={styles.stepCaption}>Pick the name you will be known by.</p>
        </div>
        <div className={styles.step}>
          <span className={styles.stepNumber}>3</span>
          <h3 className={styles.stepTitle}>Play 3 mini-games</h3>
          <p className={styles.stepCaption}>Emoji Riddles, Memory Match and Tech Trivia. Each game once.</p>
        </div>
      </div>
      <Badge qrSvg={qrSvg} />
    </>
  );
}

function RiddleScene({ qrSvg }: { qrSvg: string }) {
  return (
    <>
      <h2 className={styles.title}>Emoji Riddles</h2>
      <p className={styles.lead}>Read the emoji. Pick the answer.</p>
      <div className={styles.riddleRow}>
        <span className={styles.riddleEmoji}>🤖</span>
        <span className={styles.riddleEmoji}>☁️</span>
        <span className={styles.riddleEmoji}>📱</span>
      </div>
      <div className={styles.options}>
        <div className={styles.option}>Robot phone</div>
        <div className={`${styles.option} ${styles.optionCorrect}`}>Robot in the cloud</div>
        <div className={styles.option}>Rainy day</div>
        <div className={styles.option}>Phone call</div>
      </div>
      <Badge qrSvg={qrSvg} />
    </>
  );
}

function MemoryScene({ qrSvg }: { qrSvg: string }) {
  return (
    <>
      <h2 className={styles.title}>Memory Match</h2>
      <p className={styles.lead}>Flip two cards. Find every pair.</p>
      <div className={styles.board} aria-hidden="true">
        {MEMORY_EMOJI.map((emoji, index) => {
          const delay = MEMORY_DELAY[emoji] ?? 0;
          return (
            <div key={index} className={styles.card}>
              <div className={styles.cardInner} style={{ animationDelay: `${delay}s` }}>
                <div className={`${styles.face} ${styles.faceFront}`}>?</div>
                <div
                  className={`${styles.face} ${styles.faceBack}`}
                  style={{ animationDelay: `${(delay + 0.6).toFixed(1)}s` }}
                >
                  {emoji}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Badge qrSvg={qrSvg} />
    </>
  );
}

function TriviaScene({ qrSvg }: { qrSvg: string }) {
  return (
    <>
      <h2 className={styles.title}>Tech Trivia</h2>
      <p className={styles.lead}>Answer fast. Build a streak.</p>
      <p className={styles.question}>Which language runs in the browser?</p>
      <div className={styles.trackBar} aria-hidden="true">
        <div className={styles.fill} />
      </div>
      <div className={styles.answers}>
        <span className={styles.answer}>Python</span>
        <span className={`${styles.answer} ${styles.answerCorrect}`}>JavaScript</span>
        <span className={styles.answer}>COBOL</span>
        <span className={styles.answer}>Fortran</span>
      </div>
      <p className={styles.streak}>Streak 🔥 3</p>
      <Badge qrSvg={qrSvg} />
    </>
  );
}

function PrizeScene({ qrSvg }: { qrSvg: string }) {
  return (
    <>
      <h2 className={styles.title}>{'A prize EVERY HOUR'}</h2>
      <p className={styles.lead}>for the top 3 players of that hour</p>
      <div className={styles.prizeRow}>
        <div className={styles.podium} aria-hidden="true">
          <div className={styles.slot}>
            <span className={styles.medal}>🥈</span>
            <div className={`${styles.bar} ${styles.bar2}`}>2</div>
          </div>
          <div className={styles.slot}>
            <span className={styles.medal}>🥇</span>
            <div className={`${styles.bar} ${styles.bar1}`}>1</div>
          </div>
          <div className={styles.slot}>
            <span className={styles.medal}>🥉</span>
            <div className={`${styles.bar} ${styles.bar3}`}>3</div>
          </div>
        </div>
        <div className={styles.clockColumn}>
          <div className={styles.clock} aria-hidden="true">
            <div className={styles.clockFace}>
              <span className={styles.clockHand} />
            </div>
          </div>
          <p className={styles.clockCaption}>Every hour, on the hour</p>
        </div>
      </div>
      <p className={styles.prizeLine}>Finish all 3 games to qualify.</p>
      <Badge qrSvg={qrSvg} />
    </>
  );
}

function QrScene({ qrSvg }: { qrSvg: string }) {
  return (
    <div className={styles.qrScene}>
      <div className={styles.qrText}>
        <h2 className={styles.title}>Scan now. Play in 3 minutes.</h2>
        <p className={styles.url}>{MARKETING_URL}</p>
        <p className={styles.qrCaption}>Finish all 3 games to qualify for the hourly prize.</p>
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
    <HookScene key="hook" qrSvg={qrSvg} />,
    <HowScene key="how" qrSvg={qrSvg} />,
    <RiddleScene key="riddles" qrSvg={qrSvg} />,
    <MemoryScene key="memory" qrSvg={qrSvg} />,
    <TriviaScene key="trivia" qrSvg={qrSvg} />,
    <PrizeScene key="prizes" qrSvg={qrSvg} />,
    <QrScene key="qr" qrSvg={qrSvg} />,
  ];

  return (
    <main className={styles.root}>
      <div className={styles.stage}>
        <SceneLoop
          scenes={scenes}
          durations={[6000, 7000, 6500, 6500, 6500, 7000, 9000]}
          staticIndex={6}
        />
        <div className={styles.stripe} aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </main>
  );
}
