import Page from './Page';

// The project and the people behind it — the Credits page of the earlier Seoul Data
// Atlas, carried over as it was: title, one-paragraph summary, team, partner logos and
// the funding note.
const TEAM: [string, string][] = [
  ['Principal Investigator', 'Yoonjin Yoon'],
  ['Research', 'Keonhee Jang · Namwoo Kim · Minwoo Jeong'],
  ['Design & Development', 'Jihyeon Ohk · Youngwoo Kim · Keonhee Jang'],
];

// White marks show as they are; KUAI is black and is turned white; CAUS, GS E&C and SAIF
// are in colour and sit on a white chip so they read on the dark page.
const LOGOS = [
  {href: 'https://spacetime.kaist.ac.kr/', src: 'logos/stil_white.png', alt: 'Spacetime Intelligence Lab, KAIST', cls: 'lg'},
  {href: 'https://urban.kaist.ac.kr/', src: 'logos/KUAI.webp', alt: 'KAIST Urban AI Institute', cls: 'mono'},
  {href: 'https://caus.kaist.ac.kr/', src: 'logos/CAUS.png', alt: 'Center for Advanced Urban Systems, KAIST', cls: 'white lg'},
  {href: 'https://www.gsenc.com/', src: 'logos/gs_ec.png', alt: 'GS E&C', cls: 'white lg'},
  {href: 'https://saif.or.kr/index', src: 'logos/SAIF.png', alt: 'Seoul AI Foundation', cls: 'white'},
];

export default function AboutPage({onClose}: {onClose: () => void}) {
  return (
    <Page label="About" onClose={onClose}>
      <div className="page-eyebrow">Research Prototype</div>
      <h1 className="page-title">Seoul Data Atlas</h1>
      <p className="page-lede">
        An interactive, map-first atlas exploring how extreme heat reshapes retail activity across Seoul — combining the
        Urban Heat / Urban Sales (UHUS) datasets into a three-dimensional geospatial dashboard of all 25 districts and
        422 administrative dongs.
      </p>
      <section className="page-section">
        <h2 className="page-h">Team</h2>
        <dl className="about-roles">
          {TEAM.map(([role, names]) => <div key={role} className="about-row"><dt>{role}</dt><dd>{names}</dd></div>)}
        </dl>
      </section>
      <section className="page-section about-logos">
        {LOGOS.map((l) => (
          <a key={l.src} className={`about-logo ${l.cls}`} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={l.alt}>
            <img src={l.src} alt={l.alt} />
          </a>
        ))}
      </section>
      <div className="page-foot">
        <p>
          This research was supported by the Center for Advanced Urban Systems (CAUS) at the Korea Advanced Institute of
          Science and Technology (KAIST), funded by GS E&amp;C, as part of the KRA 5.1 (Data Visualization Interactive
          Module) research task. This research was also supported by Seoul AI Foundation's 2025 Global Collaborative
          Research Program in AI.
        </p>
      </div>
    </Page>
  );
}
