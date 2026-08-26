import { motion } from "motion/react";

export const Greeting = () => (
  <div
    className="mx-auto flex size-full max-w-3xl flex-col justify-center px-8 md:mt-20"
    key="overview"
  >
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="font-semibold text-2xl"
      exit={{ opacity: 0, y: 10 }}
      initial={{ opacity: 0, y: 10 }}
      transition={{ delay: 0.5 }}
    >
      Hello there!
    </motion.div>
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="text-2xl text-text-muted"
      exit={{ opacity: 0, y: 10 }}
      initial={{ opacity: 0, y: 10 }}
      transition={{ delay: 0.6 }}
    >
      How can I help you today?
    </motion.div>
    <motion.p
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 max-w-xl text-sm text-text-muted"
      initial={{ opacity: 0, y: 8 }}
      transition={{ delay: 0.7 }}
    >
      You are interacting with an AI system. Responses can be wrong or
      incomplete—verify important information before relying on it.
    </motion.p>
  </div>
);
