"use client";

import { ChannelPairingCard } from "@/components/pairing/channel-pairing-card";

interface Props {
  isPaired: boolean;
}

export function PairPageContent({ isPaired }: Props) {
  return (
    <ChannelPairingCard
      isPaired={isPaired}
      showUnlink={false}
      className="w-full"
    />
  );
}
