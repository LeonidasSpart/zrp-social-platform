"use client";

import { useState, useEffect } from "react";
import StoryCircle from "./StoryCircle";
import StoryViewer from "./StoryViewer";

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
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<StoryGroup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stories")
      .then((res) => res.json())
      .then((data) => {
        setGroups(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (groups.length === 0) return null;

  const hasUnseen = (group: StoryGroup) => {
    return group.stories.some(s => !s.viewed);
  };

  return (
    <>
      <div className="flex gap-4 overflow-x-auto py-3 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {groups.map((group) => (
          <StoryCircle
            key={group.user.id}
            user={group.user}
            hasUnseen={hasUnseen(group)}
            onClick={() => setSelectedGroup(group)}
          />
        ))}
      </div>

      {selectedGroup && (
        <StoryViewer
          group={selectedGroup}
          onClose={() => setSelectedGroup(null)}
          onStoryViewed={() => {
            // Refresh stories to update viewed status
            fetch("/api/stories")
              .then((res) => res.json())
              .then((data) => setGroups(data));
          }}
        />
      )}
    </>
  );
}
