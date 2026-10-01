"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Landmark, Plus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface DaoSummary {
  id: string;
  name: string;
  description: string | null;
  launchedToken: { name: string; symbol: string; imageUrl: string };
  _count: { proposals: number };
}

export default function DaoHomePage() {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const [daos, setDaos] = useState<DaoSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/launchpad/dao")
      .then((res) => res.json())
      .then((data) => setDaos(data.daos || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Landmark className="w-7 h-7 text-zrp-red" />
          <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white">{t("launchpad.dao.title")}</h1>
        </div>
        {session?.user && (
          <Link
            href="/launchpad/dao/create"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-zrp-red text-white rounded-full font-semibold hover:bg-red-700 transition text-sm"
          >
            <Plus className="w-4 h-4" />
            {t("launchpad.dao.startButton")}
          </Link>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t("launchpad.dao.subtitle")}</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : daos.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">{t("launchpad.dao.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {daos.map((dao) => (
            <Link
              key={dao.id}
              href={`/launchpad/dao/${dao.id}`}
              className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-zrp-red transition bg-white dark:bg-gray-900"
            >
              <div className="flex items-center gap-2 mb-2">
                <Image
                  src={dao.launchedToken.imageUrl}
                  alt={dao.launchedToken.name}
                  width={28}
                  height={28}
                  className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                  unoptimized
                />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{dao.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">${dao.launchedToken.symbol}</p>
                </div>
              </div>
              {dao.description && <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">{dao.description}</p>}
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {dao._count.proposals === 1
                  ? t("launchpad.dao.proposalCountOne", { count: dao._count.proposals })
                  : t("launchpad.dao.proposalCountOther", { count: dao._count.proposals })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
