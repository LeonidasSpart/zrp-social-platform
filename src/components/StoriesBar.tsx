"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Plus } from "lucide-react";
import StoryCircle from "./StoryCircle";
import StoryViewer from "./StoryViewer";
import StoryComposer from "./StoryComposer";
import { useLanguage } from "@/contexts/LanguageContext";

interface StoryGroup {
  user: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string;
  };
  stories: Array<{
    id: string;
    content?: string;
    mediaUrl?: string;
    mediaType?: string;
    createdAt: string;
    viewed: boolean;
  }>;
}

export default function StoriesBar() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<StoryGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);

  const fetchStories = async () => {
    try {
      const res = await fetch("/api/stories");
      if (!res.ok) {
        setGroups([]);
        return;
      }
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching stories:", error);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, []);

  const hasUnseen = (group: StoryGroup) => {
    return group.stories.some((s) => !s.viewed);
  };

  const userGroup = groups.find((g) => g.user.id === session?.user?.id);
  const hasOwnStories = !!userGroup;

  if (loading) return null;
  if (groups.length === 0 && !session) return null;

  return (
    <>
      <div className="flex gap-4 sm:gap-5 overflow-x-auto scrollbar-hide py-3 px-4 bg-white dark:bg-zrp-deepBlack border-b border-gray-200 dark:border-gray-800">
        {/* Your Story */}
        <button
          onClick={() => setShowComposer(true)}
          className="flex flex-col items-center gap-1 flex-shrink-0 group"
        >
          <div className="relative w-16 h-16 sm:w-[72px] sm:h-[72px]">
            <div className="w-full h-full rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden border-2 border-zrp-red">
              {session?.user?.avatarUrl ? (
                <img
                  src={session.user.avatarUrl}
                  alt={t("stories.yourStory")}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-xl font-bold">
                  {session?.user?.name?.[0] || "?"}
                </div>
              )}
            </div>
            <div className="absolute bottom-0 right-0 bg-zrp-red rounded-full p-1 border-2 border-white dark:border-gray-800">
              <Plus className="w-3 h-3 text-white" />
            </div>
          </div>
          <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[64px] sm:max-w-[72px]">
            {t("stories.yourStory")}
          </span>
        </button>

        {/* Other stories */}
        {groups.map((group, groupIndex) => {
          // Prefer an actual photo for the tray thumbnail (renders
          // simply and reliably); if the person's only story is a
          // video, fall back to that and let StoryCircle render it as
          // a real video frame instead of blindly treating it as an
          // image, which is what was causing video stories to show
          // blank/broken in the tray - mediaType was already available
          // here and simply wasn't being used.
          const imageStory = group.stories.find((s) => s.mediaUrl && s.mediaType !== "video");
          const previewStory = imageStory || group.stories.find((s) => s.mediaUrl);
          const previewUrl = previewStory?.mediaUrl || null;
          const previewType = previewStory?.mediaType || null;

          return (
            <StoryCircle
              key={group.user.id}
              user={group.user}
              hasUnseen={hasUnseen(group)}
              onClick={() => setSelectedGroup(group)}
              storyPreview={previewUrl}
              storyPreviewType={previewType}
              // Purely cosmetic alternation between the primary red ring
              // and the secondary blue accent, matching the varied story
              // rings in the design reference - does not change what the
              // ring means (still unseen vs. seen).
              ringAccent={
                groupIndex % 2 === 0 ? "red" : "blue"
              }
            />
          );
        })}
      </div>

      {selectedGroup && (
        <StoryViewer
          group={selectedGroup}
          onClose={() => setSelectedGroup(null)}
          onStoryViewed={fetchStories}
        />
      )}

      {showComposer && (
        <StoryComposer
          onClose={() => setShowComposer(false)}
          onSuccess={fetchStories}
        />
      )}
    </>
  );
}
