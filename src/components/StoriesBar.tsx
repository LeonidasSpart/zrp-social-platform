"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Plus } from "lucide-react";
import StoryCircle from "./StoryCircle";
import StoryViewer from "./StoryViewer";
import StoryComposer from "./StoryComposer";

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
  const { data: session } = useSession();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<StoryGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);

  const fetchStories = async () => {
    try {
      const res = await fetch("/api/stories");
      const data = await res.json();
      setGroups(data);
    } catch (error) {
      console.error("Error fetching stories:", error);
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
      <div className="flex gap-4 overflow-x-auto py-3 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {/* Your Story */}
        <button
          onClick={() => setShowComposer(true)}
          className="flex flex-col items-center gap-1 flex-shrink-0 group"
        >
          <div className="relative w-16 h-16">
            <div className="w-full h-full rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden border-2 border-zrp-red">
              {session?.user?.avatarUrl ? (
                <img
                  src={session.user.avatarUrl}
                  alt="Your story"
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
          <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[64px]">
            Your Story
          </span>
        </button>

        {/* Other stories */}
        {groups.map((group) => {
          const firstStoryWithMedia = group.stories.find((s) => s.mediaUrl);
          const previewUrl = firstStoryWithMedia?.mediaUrl || null;

          return (
            <StoryCircle
              key={group.user.id}
              user={group.user}
              hasUnseen={hasUnseen(group)}
              onClick={() => setSelectedGroup(group)}
              storyPreview={previewUrl}
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
