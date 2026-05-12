import React from "react";
import { Composition } from "remotion";
import { BstackInflection } from "./BstackInflection";
import { BstackCinematicHero } from "./BstackCinematicHero";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BstackInflection"
        component={BstackInflection}
        durationInFrames={30 * 30}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="BstackCinematicHero"
        component={BstackCinematicHero}
        durationInFrames={8 * 30}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
