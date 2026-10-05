import { ArrowUpRight } from "lucide-react";

import { MiooCharacter } from "@/lib/mioo-character/mioo-character";

import "./welcome.css";

export default function WelcomePage() {
    return (
        <div className="welcome-page">
            <div className="welcome-stage">
                <MiooCharacter className="welcome-character" />
            </div>
            <a className="welcome-cta" href="/create">
                开始创作
                <ArrowUpRight size={20} aria-hidden="true" />
            </a>
            <div className="welcome-wordmark" aria-hidden="true">FRAMIND</div>
        </div>
    );
}
