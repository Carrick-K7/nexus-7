"use client";

import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useState } from "react";
import { 
  Users, MessageSquare, Calendar, Megaphone,
  Heart, Share2, Bookmark, Clock
} from "lucide-react";

interface Post {
  id: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: number;
  likes: number;
  comments: number;
  category: "announcement" | "discussion" | "event" | "feedback";
}

interface Event {
  id: string;
  title: string;
  date: string;
  location: string;
  attendees: number;
  category: "community" | "official" | "cultural" | "market";
}

const now = Date.now();

export default function SocialHub() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"feed" | "events" | "announcements">("feed");
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  const posts: Post[] = [
    { id: "1", author: "Mayor Chen", avatar: "MC", content: "The new hyperloop connecting Chrome Heights to Silicon Valley II will open next week! This will reduce commute times by 40%.", timestamp: now - 3600000, likes: 234, comments: 45, category: "announcement" },
    { id: "2", author: "Night Owl", avatar: "NO", content: "Anyone else notice the increased drone activity near Iron Works district? Security seems heightened.", timestamp: now - 7200000, likes: 89, comments: 23, category: "discussion" },
    { id: "3", author: "Green Earth", avatar: "GE", content: "Great news! The new air filtration systems in Green Sector are working - AQI improved by 15% this month!", timestamp: now - 10800000, likes: 567, comments: 89, category: "feedback" },
    { id: "4", author: "Neo Citizen", avatar: "NC", content: "Community cleanup event this Saturday at Central Park. Let's keep our city beautiful! Volunteers get free power cell charges.", timestamp: now - 14400000, likes: 123, comments: 34, category: "event" },
    { id: "5", author: "ATLAS Security", avatar: "AS", content: "Reminder: Security drill tomorrow at 3AM. All residents should remain indoors during this time.", timestamp: now - 18000000, likes: 45, comments: 12, category: "announcement" },
  ];

  const events: Event[] = [
    { id: "1", title: "Tech Expo 2087", date: "Mar 15", location: "Silicon Valley II Convention Center", attendees: 12453, category: "cultural" },
    { id: "2", title: "Community Cleanup", date: "Mar 12", location: "Central Park", attendees: 342, category: "community" },
    { id: "3", title: "Market Day", date: "Mar 18", location: "Neo Downtown Plaza", attendees: 8921, category: "market" },
    { id: "4", title: "Security Briefing", date: "Mar 10", location: "City Hall", attendees: 156, category: "official" },
  ];

  const announcements = [
    { id: "1", title: "New Transit Line Opening", priority: "high", content: "Hyperloop line H7 connecting Chrome Heights to Silicon Valley II opens March 15." },
    { id: "2", title: "Power Grid Maintenance", priority: "medium", content: "Scheduled maintenance in Iron Works district on March 12, 2AM-6AM." },
    { id: "3", title: "New Trading Regulations", priority: "low", content: "Updated guidelines for resource trading now in effect." },
  ];

  const getTimeAgo = (timestamp: number) => {
    const hours = Math.floor((Date.now() - timestamp) / 3600000);
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const toggleLike = (postId: string) => {
    setLikedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-cyber-pink/20 border border-cyber-pink/30">
            <Users className="w-6 h-6 text-cyber-pink" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-pink cyber-text-glow">
              {t("socialHub")}
            </h1>
            <p className="text-cyber-text-dim mt-1">{t("socialHubDesc")}</p>
          </div>
        </div>
      </motion.div>

      <div className="flex gap-2">
        {([
          { id: "feed", label: t("communityFeed"), icon: MessageSquare },
          { id: "events", label: t("events"), icon: Calendar },
          { id: "announcements", label: t("announcements"), icon: Megaphone },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-cyber-pink/20 text-cyber-pink border border-cyber-pink/50"
                : "bg-cyber-dark/50 text-cyber-text-dim hover:bg-cyber-gray"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "feed" && (
        <div className="space-y-4">
          {posts.map((post, index) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyber-pink to-cyber-purple flex items-center justify-center text-sm font-bold">
                  {post.avatar}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-cyber-text">{post.author}</span>
                    <span className="text-xs text-cyber-text-dim">•</span>
                    <span className="text-xs text-cyber-text-dim flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {getTimeAgo(post.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-cyber-text mb-3">{post.content}</p>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleLike(post.id)}
                      className={`flex items-center gap-1 text-sm transition-colors ${
                        likedPosts.has(post.id) ? "text-cyber-red" : "text-cyber-text-dim hover:text-cyber-red"
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${likedPosts.has(post.id) ? "fill-current" : ""}`} />
                      {likedPosts.has(post.id) ? post.likes + 1 : post.likes}
                    </button>
                    <button className="flex items-center gap-1 text-sm text-cyber-text-dim hover:text-cyber-blue">
                      <MessageSquare className="w-4 h-4" />
                      {post.comments}
                    </button>
                    <button className="flex items-center gap-1 text-sm text-cyber-text-dim hover:text-cyber-green">
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button className="flex items-center gap-1 text-sm text-cyber-text-dim hover:text-cyber-yellow">
                      <Bookmark className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {activeTab === "events" && (
        <div className="grid grid-cols-2 gap-4">
          {events.map((event, index) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-cyber-text">{event.title}</h3>
                  <p className="text-xs text-cyber-text-dim mt-1">{event.location}</p>
                </div>
                <div className="px-3 py-1 rounded-lg bg-cyber-purple/20 text-xs text-cyber-purple font-medium">
                  {event.date}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-cyber-text-dim">
                  <Users className="w-4 h-4" />
                  {event.attendees.toLocaleString()} attending
                </div>
                <button className="px-3 py-1 bg-cyber-blue/20 border border-cyber-blue/30 rounded text-xs text-cyber-blue hover:bg-cyber-blue/30">
                  {t("rsvp")}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {activeTab === "announcements" && (
        <div className="space-y-4">
          {announcements.map((ann, index) => (
            <motion.div
              key={ann.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`bg-cyber-dark/50 border rounded-xl p-4 ${
                ann.priority === "high" ? "border-cyber-red/50" :
                ann.priority === "medium" ? "border-cyber-yellow/50" :
                "border-cyber-blue/20"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${
                  ann.priority === "high" ? "bg-cyber-red/20 text-cyber-red" :
                  ann.priority === "medium" ? "bg-cyber-yellow/20 text-cyber-yellow" :
                  "bg-cyber-blue/20 text-cyber-blue"
                }`}>
                  <Megaphone className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-cyber-text">{ann.title}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      ann.priority === "high" ? "bg-cyber-red/20 text-cyber-red" :
                      ann.priority === "medium" ? "bg-cyber-yellow/20 text-cyber-yellow" :
                      "bg-cyber-blue/20 text-cyber-blue"
                    }`}>
                      {ann.priority}
                    </span>
                  </div>
                  <p className="text-sm text-cyber-text-dim">{ann.content}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
