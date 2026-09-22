import { faker } from "@faker-js/faker";
import type { ClaimPartyRole, PartyType } from "@/lib/db/schema";
import { ENTITY_COUNTS } from "./distributions";
import type { SeedUser } from "./users";
import { deterministicId } from "../lib/deterministic-id";

export type SeedParty = {
  id: string;
  partyType: PartyType;
  fullName: string;
  email: string | null;
  phone: string | null;
  addressJson: Record<string, unknown>;
  userId: string | null;
};

export type SeedClaimPartyLink = {
  id: string;
  claimIndex: number;
  partyId: string;
  role: ClaimPartyRole;
};

export function generateParties(users: SeedUser[]): {
  parties: SeedParty[];
  claimantPartyIds: string[];
  holderPartyIds: string[];
} {
  faker.seed(42);

  const parties: SeedParty[] = [];
  const claimantUsers = users.filter((user) => user.role === "claimant");
  const claimantPartyIds: string[] = [];

  for (const [index, user] of claimantUsers.entries()) {
    const id = deterministicId("party-claimant", index);
    claimantPartyIds.push(id);
    parties.push({
      id,
      partyType: "person",
      fullName: user.displayName,
      email: user.email,
      phone: faker.phone.number(),
      addressJson: {
        line1: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        postalCode: faker.location.zipCode(),
      },
      userId: user.id,
    });
  }

  const holderPartyIds: string[] = [];
  const holderCount = ENTITY_COUNTS.policies;
  for (let i = 0; i < holderCount; i += 1) {
    const id = deterministicId("party-holder", i);
    holderPartyIds.push(id);

    if (i < claimantPartyIds.length) {
      const claimant = parties[i];
      parties.push({
        id,
        partyType: claimant.partyType,
        fullName: claimant.fullName,
        email: claimant.email,
        phone: claimant.phone,
        addressJson: claimant.addressJson,
        userId: claimant.userId,
      });
      continue;
    }

    parties.push({
      id,
      partyType: faker.helpers.arrayElement(["person", "organization"] as const),
      fullName: faker.person.fullName(),
      email: faker.internet.email(),
      phone: faker.phone.number(),
      addressJson: {
        line1: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        postalCode: faker.location.zipCode(),
      },
      userId: null,
    });
  }

  const extraCount = ENTITY_COUNTS.parties - parties.length;
  for (let i = 0; i < extraCount; i += 1) {
    parties.push({
      id: deterministicId("party-extra", i),
      partyType: faker.helpers.arrayElement(["person", "organization"] as const),
      fullName: faker.person.fullName(),
      email: faker.internet.email(),
      phone: faker.phone.number(),
      addressJson: {
        line1: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        postalCode: faker.location.zipCode(),
      },
      userId: null,
    });
  }

  return { parties, claimantPartyIds, holderPartyIds };
}

export function buildClaimPartyLinks(
  claimCount: number,
  claimantPartyIds: string[],
  extraPartyIds: string[],
): SeedClaimPartyLink[] {
  const links: SeedClaimPartyLink[] = [];
  let linkIndex = 0;

  for (let claimIndex = 0; claimIndex < claimCount; claimIndex += 1) {
    const claimantPartyId =
      claimantPartyIds[claimIndex % claimantPartyIds.length];
    links.push({
      id: deterministicId("claim-party", linkIndex),
      claimIndex,
      partyId: claimantPartyId,
      role: "claimant",
    });
    linkIndex += 1;

    if (claimIndex % 3 === 0) {
      links.push({
        id: deterministicId("claim-party", linkIndex),
        claimIndex,
        partyId: extraPartyIds[claimIndex % extraPartyIds.length],
        role: "witness",
      });
      linkIndex += 1;
    }

    if (claimIndex % 4 === 1) {
      links.push({
        id: deterministicId("claim-party", linkIndex),
        claimIndex,
        partyId: extraPartyIds[(claimIndex + 1) % extraPartyIds.length],
        role: "repairer",
      });
      linkIndex += 1;
    }
  }

  return links;
}
