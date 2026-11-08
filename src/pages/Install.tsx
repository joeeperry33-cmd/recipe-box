import InstallHelp from "../components/InstallHelp";
import { APP_NAME } from "../lib/links";

export default function Install({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="section">
      <h2>Install {APP_NAME}</h2>
      <p className="muted" style={{ margin: 0 }}>It's free and doesn't need an app store. Once it's installed, it opens from your home screen like any other app.</p>
      <div className="card share-cta"><InstallHelp /></div>
      <a className="btn" href="#/">{signedIn ? "Back to my recipes" : "Sign in or create an account"}</a>
    </div>
  );
}
