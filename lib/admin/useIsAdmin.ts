"use client";

import { useEffect, useState } from "react";
import { isAdminTelegramUser, readTelegramUserId } from "@/lib/admin/is-admin";

export function useIsAdmin(commanderTelegramId: number): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(
      isAdminTelegramUser(readTelegramUserId(), commanderTelegramId),
    );
  }, [commanderTelegramId]);

  return isAdmin;
}
