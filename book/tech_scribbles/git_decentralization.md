# GIT Decentralization

So just remember that Git and GitHub are not the same. Git is a version control tool, and GitHub is a collaboration tool that happens to use Git, and provides a framework for a specific type of development cycle that is very well established and familiar to many people.

Git is both.

It is distributed in the sense that anyone with a clone of a particular repository is theoretically "equal" to any other developer with a clone of the same repo. One of the main reasons this approach is used is to allow any developer to continue their work without the need to always be connected to a centralized master server. If you have your own complete copy, and it's "equal" to any other, you can develop against it and sync up later.

Much of the same applies to explain why it is decentralized. One of the core concepts is that there is no "main" server. The problem with that is, in many situations (like a software engineer for a large company), there really is a need to have a centralized master. It's not that Git isn't meant for this type of workflow (`clone --> develop --> commit --> push to central repo`), but rather that it doesn't force it upon you. Since that has been such a ubiquitous way of working, it's become the norm to use GitHub on top of Git to provide the desired structure to enable this type of development cycle.

Also, git can communicate with any host, it is in no way dependent on GitHub to provide centralization, even though we often treat it as if that were the case. Git can use SSH, HTTP(S), and even it's own proprietary protocol to push and fetch data from a repo on any other system, provided the user has the ability to log in to that host. This is not particularly comparable to blockchain.