import { mediaUrlForBrowser } from './media-compat';

/** Artwork is a local, optimized project asset; water, mist, petals and light remain independent layers. */
export function MountainGateScene() {
  const mobilePoster = mediaUrlForBrowser('/scenes/gate-moonlight-mobile.webp');
  const desktopPoster = mediaUrlForBrowser('/scenes/gate-moonlight.webp');
  const mobilePosterType = mobilePoster.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';
  return <div className="scene" aria-hidden="true">
    <picture className="scene-picture">
      <source media="(max-width: 720px)" srcSet={mobilePoster} type={mobilePosterType} />
      <img className="scene-base" src={desktopPoster} alt="" draggable={false} />
    </picture>
    <div className="scene-mist scene-mist-back" />
    <div className="scene-mist scene-mist-front" />
    <div className="scene-cloud-drift scene-cloud-drift-one" />
    <div className="scene-cloud-drift scene-cloud-drift-two" />
    <svg className="scene-motion" viewBox="0 0 1664 1024" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="water-trace"><stop stopColor="#c3d9e8" stopOpacity=".1"/><stop offset=".5" stopColor="#eff8ff" stopOpacity=".72"/><stop offset="1" stopColor="#aac3d5" stopOpacity=".1"/></linearGradient>
        <linearGradient id="reflection"><stop stopColor="#f6d5a2" stopOpacity="0"/><stop offset=".5" stopColor="#f6d5a2" stopOpacity=".48"/><stop offset="1" stopColor="#f6d5a2" stopOpacity="0"/></linearGradient>
      </defs>
      <g className="waterfall-traces" fill="none" stroke="url(#water-trace)" strokeLinecap="round">
        <path d="M116 144C119 206 131 266 143 351M327 430C329 482 335 539 354 604M1555 300C1551 365 1545 428 1539 500M1340 457C1336 507 1336 552 1330 596" strokeWidth="5" strokeDasharray="20 19"/>
        <path d="M121 146C123 211 136 273 148 347M332 434C334 484 340 541 359 600M1550 303C1548 367 1542 428 1536 497" strokeWidth="1.5" strokeDasharray="8 15"/>
      </g>
      <g className="lake-reflections" fill="none" stroke="url(#reflection)" strokeLinecap="round">
        <path d="M716 799Q833 811 950 799M674 829Q832 844 989 829M738 863Q834 872 931 863M604 903Q832 915 1060 903" strokeWidth="3"/>
      </g>
      <g className="scene-petals" fill="#e8a9ba">
        <ellipse cx="470" cy="598" rx="4" ry="8"/><ellipse cx="1200" cy="634" rx="3" ry="6"/><ellipse cx="1000" cy="736" rx="4" ry="7"/><ellipse cx="571" cy="809" rx="3" ry="6"/>
      </g>
    </svg>
    <svg className="scene-motion scene-motion-mobile" viewBox="0 0 1024 1536" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="mobile-water"><stop stopColor="#c3d9e8" stopOpacity=".1"/><stop offset=".5" stopColor="#eff8ff" stopOpacity=".72"/><stop offset="1" stopColor="#aac3d5" stopOpacity=".1"/></linearGradient></defs>
      <g className="waterfall-traces" fill="none" stroke="url(#mobile-water)" strokeLinecap="round" strokeDasharray="20 19" strokeWidth="5">
        <path d="M84 510C91 590 101 680 113 830M930 650C922 735 914 815 904 886M332 690C335 746 341 791 352 847"/>
      </g>
      <g className="lake-reflections" fill="none" stroke="#f6d5a2" strokeOpacity=".36" strokeLinecap="round" strokeWidth="3">
        <path d="M405 1150Q514 1160 622 1150M350 1215Q514 1228 678 1215M425 1288Q514 1297 603 1288M300 1360Q514 1372 728 1360"/>
      </g>
      <g className="scene-petals" fill="#e8a9ba"><ellipse cx="270" cy="875" rx="4" ry="8"/><ellipse cx="734" cy="1050" rx="3" ry="6"/><ellipse cx="540" cy="1268" rx="4" ry="7"/></g>
    </svg>
  </div>;
}
