# Intro to Reinforcement Learning with Python


# Exploring Multi-Arm Bandit Problem

Deep learning has drastically improved the state of the art in the artificial intelligence and machine learning fields.
Supervised learning methods such as object recognition required training artificial neural networks on large data sets that must be pre labeled by humans. While this often leads the high accuracy solutions, what about problems to which we don't already have explicit answers or cannot easily be labeled beforehand?  
Enter Reinforcement Learning. Reinforcement Learning, or RL for short, involves setting up a framework of reward signals based on the RL agent's learning environment.

Let's look at a famous example:
Slot machines at casinos are often referred to as one armed bandits. A common thought experiment used when introducing students to R.L. is the multi armed bandit problem.
Imagine that you have a slot machine, but instead of one arm, it has K number of arms. This is why the multi armed bandit problem is often referred to as the K Arm bandit problem.
Each arm has a different probability that it will return a particular reward, some low, some high, some even negative. We don't know what these reward values are beforehand nor do we know the probabilities that any given arm will give any particular reward value.
So how do we solve this problem? Well, K represents the number of potential actions or agent
could take. Our objective is to maximize the reward over a given number of action selections or time steps.
We have no prior knowledge of the environment at this point, so we have no choice but to begin by selecting levers at random as we select actions over time-step t, each of the K actions has a probable expected reward that becomes more clear as we continue. We would call this "the value". The better we can approximate this value, the better our agent will perform.
This is known as value function approximation. Back to our multi armed bandit analogy.
As your agent pulls the levers, it becomes clear that when certain ones are pulled, they're very likely to give a high reward and thus are said to have a high value. One decision the agent could make is to exploit these actions, which are known as greedy actions.
This leaves our agent in a conundrum, though, doesn't it? If it exploits the first high value arm it pulls, it could be missing out on discovering levers with even higher values.
This reveals a dichotomy in RL that must always be balanced: Exploration versus exploitation. Ways to balance exploring to discover new rewards with exploiting what the agent
has are at once many varied and nuanced.

What is important is not what specific methods are used to balance them, but rather to ensure that some measure is being done to balance them. Herein lies an opportunity for ingenuity, in the ways that this balance could be achieved.
Off policy learning such as Q-learning tends to favour exploration over exploitation.
This is the case because off policy learning by definition uses a separate learning policy from its behavior policy. In other words, it is often non greedy and explores all action possibilities.
An example of off policy Q learning is DeepMind's Atari playing DQN, which stands for Deep Q network. 

On policy algorithms such as Monte Carlo estimation methods, on the other hand, use a variety of techniques to modify the behavior policy directly. As Sutton says in his book Reinforcement Learning: An Introduction, on-policy learning methods attempt to evaluate or improve the policy
that is used to make decisions, whereas off policy methods evaluate or improve a policy different from that used to generate the data.

# Markov Decision Processes

MDP serve as a functional framework for representing the state and interactions with the learning environment. These methods could also be said to be related to dynamic
programming and finite state machines. MDP is a form of reinforcement learning developed as a way to combine machine learning methods with dynamic programming methods.

MDP and dynamic programming methods are used to solve stochastic optimal control problems. This is a control problem where state variables and a decision system are not known with certainty, although the state is fully observed. For instance, the multi armed abandoned problem is a good example of this. When the state and action spaces are small enough, we can usually use a Markov process to find exact solutions, meaning they can find the optimal value function and the optimal policy. Sometimes, however, it is necessary to approximate solutions for larger problem sets.

Markov decision problems are problems that have states with the Markov property. The markov property states that the future is independent of the past, given the present. What this means is that for Markov problems, it is usually sufficient to throw away past experience in favor of the current state *s* of the environment at each time step *t.* The processes in some state *s* and the age of $t_{n}$ time steps may choose any action *A* that is available in state *s* next time the process responds a time step *t* by randomly moving to a new state *s'* and giving the agent the corresponding reward *r* to the power of action corresponding to the state and the next state.