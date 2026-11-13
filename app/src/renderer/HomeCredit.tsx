import { REPOSITORY_URL } from "../main/repository";

// Set by electron-vite (and Vitest) at build time, so the copyright follows the build, not a year written here.
declare const __DOAN_BUILD_YEAR__: number;
export const BUILD_YEAR: number = __DOAN_BUILD_YEAR__;

const EMAIL = "ox501501@gmail.com";

// Home's quiet footer. The link asks main to open its fixed repository URL; a browser that does not open shows
// nothing, since the address is already on screen.
export function HomeCredit() {
  return <footer className="home-credit"><p className="home-credit-line">
    <span>{`© ${BUILD_YEAR} Doan`}</span><span aria-hidden="true"> | </span>
    <a className="home-credit-link" href={REPOSITORY_URL} onClick={event => { event.preventDefault(); void window.doan.openRepository().catch(() => false); }}>{REPOSITORY_URL.replace(/^https:\/\//, "")}</a>
    <span aria-hidden="true"> | </span><span className="selectable">{EMAIL}</span>
  </p></footer>;
}
