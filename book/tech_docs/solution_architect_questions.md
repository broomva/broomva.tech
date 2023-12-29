# Solution Architect Questions


SOLUTION ARCHITECT
[https://github.com/donnemartin/system-design-primer](https://github.com/donnemartin/system-design-primer)

# Security

- IDS: intrusion detection system is a device or software application that monitors a network or systems for malicious activity or policy violations, an IDS differs from a firewall in that a traditional network firewall (distinct from a Next-Generation Firewall ) uses a static set of rules to permit or deny network connections. It implicitly prevents intrusions, assuming an appropriate set of rules have been defined. Essentially, firewalls limit access between networks to prevent intrusion and do not signal an attack from inside the network. An IDS describes a suspected intrusion once it has taken place and signals an alarm. An IDS also watches for attacks that originate from within a system. This is traditionally achieved by examining network communications, identifying heuristics and patterns (often known as signatures) of common computer attacks, and taking action to alert operators.
Signature-based IDS refers to the detection of attacks by looking for specific patterns, such as byte sequences in network traffic, or known malicious instruction sequences used by malware
Anomaly-based intrusion detection systems were primarily introduced to detect unknown attacks, in part due to the rapid development of malware. The basic approach is to use machine learning to create a model of trustworthy activity, and then compare new behavior against this model
- Encryption at rest/in transit: Encryption at rest protects your data from a system compromise or data exfiltration by encrypting data while stored. The Advanced Encryption Standard (AES) is often used to encrypt data at rest.
Encryption in transit: protects your data if communications are intercepted while data moves between your site and the cloud provider or between two services. This protection is achieved by encrypting the data before transmission; authenticating the endpoints; and decrypting and verifying the data on arrival. For example, Transport Layer Security (TLS) is often used to encrypt data in transit for transport security, and Secure/Multipurpose Internet Mail Extensions (S/MIME) is used often for email message security.
- Symmetric and asymmetric encryption: Symmetric, this is the simplest kind of encryption that involves only one secret key to cipher and decipher information. Symmetrical encryption is an old and best-known technique. It uses a secret key that can either be a number, a word or a string of random letters. The most widely used symmetric algorithm is AES-128, AES-192, and AES-256.
Asymmetric encryption uses two keys to encrypt a plain text. A public key is made freely available to anyone who might want to send you a message. The second private key is kept a secret so that you can only know. A message that is encrypted using a public key can only be decrypted using a private key, while also, a message encrypted using a private key can be decrypted using a public key. Security of the public key is not required because it is publicly available and can be passed over the internet. Popular asymmetric key encryption algorithm includes EIGamal, RSA, DSA, Elliptic curve techniques, PKCS.
To use asymmetric encryption, there must be a way of discovering public keys. One typical technique is using digital certificates in a client-server model of communication. A certificate is a package of information that identifies a user and a server.
- Web Application Firewall Vs Firewall: A web application firewall (or WAF) filters, monitors, and blocks HTTP traffic to and from a web application. A WAF is differentiated from a regular firewall in that a WAF is able to filter the content of specific web applications while regular firewalls serve as a safety gate between servers. By inspecting HTTP traffic, it can prevent attacks stemming from web application security flaws, such as SQL injection, cross-site scripting (XSS), file inclusion, and security misconfigurations. Network Firewall works at 3rd and 4th layer of OSI Layer architecture, whereas, WAF works at 3rd to 7th layer of OSI Layer architecture. A Network firewall can coverage any protocol type, whereas, WAF can coverage Web-centric: HTTP(s), XML, SOAP, SPDY.
- Where are customer encryption keys stored: In AWS KSM (Key Management System) and stored internally within a server in a folder like /etc/ssl/private
- How would you mitigate a DOS? IP Whitelisting/Blacklisting, Rate limiting is the practice of limiting the amount of traffic available to a specific Network Interface Controller (NIC). Filter requests upstream, long before it reaches the target network. For example Amazon Shield and Cloudflare both offer products that allow for protection against DoS and DDoS attacks by checking incoming packet IPs against known attackers and BotNets and attempt to only forward legitimate traffic.
- What is identity management? Identity management (IdM), also known as identity and access management (IAM or IdAM), is a framework of policies and technologies for ensuring that the proper people in an enterprise have the appropriate access to technology resources. 
Typical identity management functionality includes the following: [Access control,](https://en.wikipedia.org/wiki/Access_control) [Cloud computing,](https://en.wikipedia.org/wiki/Cloud_computing) [Digital identity](https://en.wikipedia.org/wiki/Digital_identity) management, [Password manager,](https://en.wikipedia.org/wiki/Password_manager) [Workflow automation,](https://en.wikipedia.org/wiki/Workflow_automation) [Provisioning,](https://en.wikipedia.org/wiki/Provisioning) [Single sign-on,](https://en.wikipedia.org/wiki/Single_sign-on) [Security Token Service,](https://en.wikipedia.org/wiki/Security_Token_Service) [Role based access control,](https://en.wikipedia.org/wiki/Role_based_access_control) [Risk management](https://en.wikipedia.org/wiki/Risk_management).

# Storage

- Different types of storage: Magnetic storage devices: [Floppy diskette,](https://www.computerhope.com/jargon/f/fdd.htm) [Hard drive,](https://www.computerhope.com/jargon/h/harddriv.htm) [Magnetic strip,](https://www.computerhope.com/jargon/m/magncard.htm) [SuperDisk,](https://www.computerhope.com/jargon/s/superdisk.htm) [Tape cassette,](https://www.computerhope.com/jargon/t/tape.htm) [Zip diskette](https://www.computerhope.com/jargon/z/zipdrive.htm). Optical storage devices: [Blu-ray disc,](https://www.computerhope.com/jargon/b/bd.htm) [CD-ROM disc,](https://www.computerhope.com/jargon/c/cdrom.htm) [CD-R and CD-RW disc,](https://www.computerhope.com/jargon/c/cdr.htm) [DVD-R, DVD+R, DVD-RW, and DVD+RW disc](https://www.computerhope.com/jargon/d/dvdr.htm). Flash memory devices: [USB flash drive, jump drive, or thumb drive,](https://www.computerhope.com/jargon/j/jumpdriv.htm) [CF (CompactFlash),](https://www.computerhope.com/jargon/c/cf.htm) [M.2,](https://www.computerhope.com/jargon/m/m2.htm) [Memory card,](https://www.computerhope.com/jargon/m/memocard.htm) [MMC,](https://www.computerhope.com/jargon/m/mmc.htm) [NVMe,](https://www.computerhope.com/jargon/n/nvme.htm) [SDHC Card,](https://www.computerhope.com/jargon/s/sdhc.htm) [SmartMedia Card,](https://www.computerhope.com/jargon/s/smartmed.htm) [Sony Memory Stick,](https://www.computerhope.com/jargon/m/memstick.htm) [SD card,](https://www.computerhope.com/jargon/s/sdcard.htm) [SSD,](https://www.computerhope.com/jargon/s/ssd.htm) [xD-Picture Card](https://www.computerhope.com/jargon/x/xdpicture.htm). Online and cloud: [Cloud storage,](https://www.computerhope.com/jargon/c/cloudcom.htm) [Network media](https://www.computerhope.com/jargon/n/network.md). Volatile storage like RAM.
- NAS vs SAN: A storage area network (SAN) provides a pool of storage resources that can be centrally managed and allocated as needed. A SAN consists of interconnected hosts, switches and storage devices. The components can be connected using a variety of protocols. A SAN typically uses Fibre Channel connectivity. The network-attached storage (NAS) typically ties into to the network through a standard Ethernet connection. To a client OS, a SAN typically appears as a disk and exists as its own separate network of storage devices, while NAS appears as a file server.
- RAID levels: In computer storage, the standard RAID levels comprise a basic set of RAID (redundant array of independent disks) configurations that employ the techniques of striping, mirroring, or parity to create large reliable data stores from multiple general-purpose computer hard disk drives (HDDs). RAID 0 (also known as a stripe set or striped volume) splits ("stripes") data evenly across two or more disks, without parity information, redundancy, or fault tolerance. RAID 1 consists of an exact copy (or mirror) of a set of data on two or more disks; a classic RAID 1 mirrored pair contains two disks. RAID 2, which is rarely used in practice, stripes data at the bit (rather than block) level, and uses a Hamming code for error correction. RAID 3, which is rarely used in practice, consists of byte-level striping with a dedicated parity disk. One of the characteristics of RAID 3 is that it generally cannot service multiple requests simultaneously, which happens because any single block of data will, by definition, be spread across all members of the set and will reside in the same physical location on each disk. RAID 4 consists of block-level striping with a dedicated parity disk. As a result of its layout, RAID 4 provides good performance of random reads, while the performance of random writes is low due to the need to write all parity data to a single disk. RAID 5 consists of block-level striping with distributed parity. Unlike in RAID 4, parity information is distributed among the drives. It requires that all drives but one be present to operate. Upon failure of a single drive, subsequent reads can be calculated from the distributed parity such that no data is lost. RAID 6 extends RAID 5 by adding another parity block; thus, it uses block-level striping with two parity blocks distributed across all member disks.

[RAID Levels](Solution%20Architect%20Questions/RAID%20Levels.csv)

- Can RAID1 be used for Gaming? When it comes to RAID 1, its advantage in excellent fault tolerance is worthy of mention. In RAID 1, internal drives are separated two sets. And the first set is mirrored to the second set. Hence, if one drive fails, you still can access your data. But, it is due to mirroring that RAID 1 is much slower than other RAID levels. So, in terms of playing game, RAID 1 is not a good choice
- IOPS: Input/output operations per second is an input/output performance measurement used to characterize computer storage devices like hard disk drives (HDD), solid state drives (SSD), and storage area networks (SAN). The most common performance characteristics measured are sequential and random operations. Sequential operations access locations on the storage device in a contiguous manner and are generally associated with large data transfer sizes, e.g. 128 kB. Random operations access locations on the storage device in a non-contiguous manner and are generally associated with small data transfer sizes, e.g. 4kB.
- TPH/latency: Throughput is a rate. A rate is the measure of how many actions are completed in a unit of time.This measure is most often characterized as TPS (transactions per second), TPM (transactions per minute), TPH (transactions per hour), or TPD (transactions per day). Throughput is not the inverse of latency. Your installation might have a high latency of 2 seconds, but a tremendous throughput rate of 2,000 TPS. Throughput is typically critical for automated workloads, such as harness-driven inputs or bulk search operations
- EBS: Amazon Elastic Block Store (EBS) is an easy to use, high performance block storage service designed for use with Amazon Elastic Compute Cloud (EC2) for both throughput and transaction intensive workloads at any scale. A broad range of workloads, such as relational and non-relational databases, enterprise applications, containerized applications, big data analytics engines, file systems, and media workflows are widely deployed on Amazon EBS.
- Dedupe vs WAN optimization: WAN optimization is a collection of techniques for increasing data transfer efficiencies across wide-area networks (WANs):
    - **Deduplication** – Eliminates the transfer of redundant data across the WAN by sending references instead of the actual data. By working at the byte level, benefits are achieved across IP applications.
    - **Compression** – Relies on data patterns that can be represented more efficiently. Essentially compression techniques similar to ZIP, RAR, ARJ etc. are applied on-the-fly to data passing through hardware (or virtual machine) based WAN acceleration appliances.
    - **Latency optimization** – Can include TCP refinements such as window-size scaling, selective acknowledgements, Layer 3 congestion control algorithms, and even co-location strategies in which the application is placed in near proximity to the endpoint to reduce latency. In some implementations, the local WAN optimizer will answer the requests of the client locally instead of forwarding the request to the remote server in order to leverage write-behind and read-ahead mechanisms to reduce WAN latency.
    - **Caching/proxy** – Staging data in local [caches](https://en.wikipedia.org/wiki/Web_cache); Relies on human behavior, accessing the same data over and over.
    - **[Forward error correction](https://en.wikipedia.org/wiki/Forward_error_correction)** – Mitigates packet loss by adding another loss-recovery packet for every “N” packets that are sent, and this would reduce the need for retransmissions in error-prone and congested WAN links.
    - **[Protocol spoofing](https://en.wikipedia.org/wiki/Protocol_spoofing)** – Bundles multiple requests from chatty applications into one. May also include stream-lining protocols such as [CIFS](https://en.wikipedia.org/wiki/CIFS).
    - **[Traffic shaping](https://en.wikipedia.org/wiki/Traffic_shaping)** – Controls data flow for specific applications. Giving flexibility to network operators/network admins to decide which applications take precedence over the WAN. A common use case of traffic shaping would be to prevent one protocol or application from hogging or flooding a link over other protocols deemed more important by the business/administrator. Some WAN acceleration devices are able to traffic shape with granularity far beyond traditional network devices. Such as shaping traffic on a per user AND per application basis simultaneously.
    - **Equalizing** – Makes assumptions on what needs immediate priority based on the data usage. Usage examples for equalizing may include wide open unregulated Internet connections and clogged VPN tunnels.
    - **Connection limits** – Prevents access gridlock in and to denial of service or to peer. Best suited for wide open Internet access links, can also be used links.
    - **Simple rate limits** – Prevents one user from getting more than a fixed amount of data. Best suited as a stop gap first effort for remediating a congested Internet connection or WAN link.
- Why hash a file: If you are transferring a file from one computer to another, how do you ensure that the copied file is the same as the source? One method you could use is called hashing, which is essentially a process that translates information about the file into a code. Two hash values (of the original file and its copy) can be compared to ensure the files are equal. Hashing is an algorithm that calculates a fixed-size bit string value from a file. A file basically contains blocks of data. Hashing transforms this data into a far shorter fixed-length value or key which represents the original string. The hash value can be considered the distilled summary of everything within that file.
- Containerization - Docker: A container is a standard unit of software that packages up code and all its dependencies so the application runs quickly and reliably from one computing environment to another. A Docker container image is a lightweight, standalone, executable package of software that includes everything needed to run an application: code, runtime, system tools, system libraries and settings.
- Object storage Vs file system: File storage, also called file-level or file-based storage, is exactly what you think it might be: Data is stored as a single piece of information inside a folder. When you need to access that piece of data, your computer needs to know the path to find it. Block storage chops data into blocks and stores them as separate pieces. Each block of data is given a unique identifier, which allows a storage system to place the smaller pieces of data wherever is most convenient. Because block storage doesn’t rely on a single path to data—like file storage does—it can be retrieved quickly. Each block lives on its own and can be partitioned so it can be accessed in a different operating system, which gives the user complete freedom to configure their data. Object storage, also known as object-based storage, is a flat structure in which files are broken into pieces and spread out among hardware. In object storage, the data is broken into discrete units called objects and is kept in a single repository, instead of being kept as files in folders or as blocks on servers. Object storage volumes work as modular units: each is a self-contained repository that owns the data, a unique identifier that allows the object to be found over a distributed system, and the metadata that describes the data. Object storage requires a simple HTTP application programming interface (API), which is used by most clients in all languages. Object storage is cost efficient: you only pay for what you use. It can scale easily, making it a great choice for public cloud storage. It’s a storage system well suited for static data, and its agility and flat nature means it can scale to extremely large quantities of data.
- Puppet & Chef: Configuration managers provide an abstraction layer between a machine’s raw configuration and its desired state by focusing on users’ goals. Configuration managers use well-defined language to manage all the operations’ needs, so knowledge can be shared between projects. Each time a new member of the team is hired, there is no longer a need to explain all the intricacies of a homebrewed system. Only the knowledge of a standard tool is required. Puppet uses a declarative language that is similar to JSON or XML. You describe the resource’s state but cannot intervene in how this state is achieved. Chef uses an imperative language. This means you more or less have full-featured Ruby at your disposal. n Puppet, you create manifests and modules, while in Chef you deal with recipes and cookbooks. Manifests and recipes usually describe single resources while modules and cookbooks describe the more general concepts
- If need to construct 3-tier layer of storage, how can you inline each tier? Tiered storage is a way to assign different categories of data to various types of storage media with the objective of reducing the total cost of storage. A tiered storage architecture places data in a hierarchy according to its business value. Tiers are determined by performance and cost of the media, and data is ranked by how often users access it. Generally, the most important data is served from the fastest storage media, which typically is the most expensive. Tier 0 storage is the fastest and most expensive layer in the hierarchy and is suited for applications with little tolerance for downtime or latency. Data placed in a "zero tier" often includes scale-up transactional databases for analytics, financials, healthcare and security. Tier 1 data includes mission-critical applications, recently accessed data or top-secret files. This data might be stored on expensive, high-quality media. Tier 1 storage is reserved for data that depends on fast reads and writes, such as any application linked to revenue or business operations. Data on Tier 2 storage usually contains historical financial information, cold data and classified files. This data is preserved on lower-cost media in a conventional storage area network (SAN).
- Discuss durability vs availability: Availability refers to system uptime, i.e. the storage system is operational and can deliver data upon request. Historically, this has been achieved through hardware redundancy so that if any component fails, access to data will prevail. Durability, on the other hand, refers to long-term data protection, i.e. the stored data does not suffer from bit rot, degradation or other corruption. Rather than focusing on hardware redundancy, it is concerned with data redundancy so that data is never lost or compromised. A common approach to ensuring data availability has been through RAID-based architectures. Striping data across multiple drives can protect against the failure of one or two drives. Hyper-scale data centers and cloud services providers use object-based storage to meet the needs for the highest data availability and data durability.
- Discuss SSD vs traditional disk: A typical SSD uses what is called NAND-based flash memory. This is a non-volatile type of memory. An SSD does not have a mechanical arm to read and write data, it instead relies on an embedded processor (or “brain”) called a controller to perform operations related to reading and writing data. The controller is a very important factor in determining the SSD read write speed. Decisions it makes related to how to store, retrieve, cache and clean up data can determine the overall SSD speed. An HDD uses magnetism to store data on a rotating platter. A read/write head floats above the spinning platter reading and writing data. The faster the platter spins, the faster an HDD can perform. Typical laptop drives today spin at either 5400 RPM (Revolutions per Minute) or 7200RPM, though some server-based platters spin at up to 15,000 RPM! The major advantage of an HDD is that it is capable of storing lots of data cheaply.
An HDD might be the right choice if:
    - You need lots of storage capacity, up to 10TB
    - Don’t want to spend much money
    - Don’t care too much about how fast a computer boots up or opens programs – then get a hard drive (HDD).
    
    An SSD might be the right choice if:
    
    - You are willing to pay for faster performance
    - Don’t mind limited storage capacity or can work around that (though consumer SSD now go up to 4TB and enterprise run as high as 60TB)
    - How would you analyze objects stored in S3 and share them with users
    

[SDD VS HDD](Solution%20Architect%20Questions/SDD%20VS%20HDD.csv)

# Networking

- Load balancing: Load balancing is the process of distributing network traffic across multiple servers. This ensures no single server bears too much demand. By spreading the work evenly, load balancing improves application responsiveness.
    - Least Connection Method — directs traffic to the server with the fewest active connections. Most useful when there are a large number of persistent connections in the traffic unevenly distributed between the servers.
    - Least Response Time Method — directs traffic to the server with the fewest active connections and the lowest average response time.
    - Round Robin Method — rotates servers by directing traffic to the first available server and then moves that server to the bottom of the queue. Most useful when servers are of equal specification and there are not many persistent connections.
    - IP Hash — the IP address of the client determines which server receives the request.
- DNS: The Domain Name System (DNS) is a hierarchical and decentralized naming system for computers, services, or other resources connected to the Internet or a private network. It associates various information with domain names assigned to each of the participating entities. Most prominently, it translates more readily memorized domain names to the numerical IP addresses needed for locating and identifying computer services and devices with the underlying network protocols
- TCP vs. UDP: Transmission Control Protocol (TCP) is a connection-oriented protocol that computers use to communicate over the internet. It is one of the main protocols in TCP/IP networks. TCP provides error-checking and guarantees delivery of data and that packets will be delivered in the order they were sent. User Datagram Protocol (UDP) is a connectionless protocol that works just like TCP but assumes that error-checking and recovery services are not required. Instead, UDP continuously sends datagrams to the recipient whether they receive them or not.
    - TCP is a connection-oriented protocol and UDP is a connection-less protocol. TCP establishes a connection between a sender and receiver before data can be sent. UDP does not establish a connection before sending data
    - TCP is reliable. Data sent using a TCP protocol is guaranteed to be delivered to the receiver. If data is lost in transit it will recover the data and resend it. TCP will also check packets for errors and track packets so that data is not lost or corrupted. UDP is unreliable, it does not provide guaranteed delivery and a datagram packet may become corrupt or lost in transit.
    - TCP uses a flow control mechanism that ensures a sender is not overwhelming a receiver by sending too many packets at once. TCP stores data in a send buffer and receives data in a receive buffer. When an application is ready, it will read the data from the receive buffer. If the receive buffer is full, the receiver would not be able to handle more data and would drop it. UDP does not provide flow control. With UDP, packets arrive in a continuous stream or they are dropped.
    - TCP does ordering and sequencing to guarantee that packets sent from a server will be delivered to the client in the same order they were sent. On the other hand, UDP sends packets in any order.
    - TCP is slower than UDP because it has a lot more to do. TCP has to establish a connection, error-check, and guarantee that files are received in the order they were sent.
    - TCP is best suited to be used for applications that require high reliability where timing is less of a concern.
        - World Wide Web (HTTP, HTTPS)
        - Secure Shell (SSH)
        - File Transfer Protocol (FTP)
        - Email (SMTP, IMAP/POP)
        
        UDP is best suited for applications that require speed and efficiency.
        
        - VPN tunneling
        - Streaming videos
        - Online games
        - Live broadcasts
        - Domain Name System (DNS)
        - Voice over Internet Protocol (VoIP)
        - Trivial File Transfer Protocol (TFTP)
- UDP Unicast vs Multicast: A Unicast transmission/stream sends IP packets to a single recipient on a network. A Multicast transmission sends IP packets to a group of hosts on a network
- When would DNS protocol use TCP vs. UDP transport protocol?  DNS uses TCP when the size of the request or the response is greater than a single packet such as with responses that have many records or many IPv6 responses or most DNSSEC responses. The maximum size was originally 512 bytes but there is an extension to the DNS protocol that allows clients to indicate that they can handle UDP responses of up to 4096 bytes. DNSSEC responses are usually larger than the maximum UDP size. Transfer requests are usually larger than the maximum UDP size and hence will also be done over TCP.
- Hypervisor dns router & switch: Hyper-V’s virtual switch is truly a virtual switch. That is to say, it is a software construct operating within the active memory of a Hyper-V host that performs Ethernet frame switching functionality. It can use single or teamed physical network adapters to serve as uplinks to a physical switch in order to communicate with other computers on the physical network. Hyper-V provides virtual network adapters to its virtual machines, and those communicate directly with the virtual switch.
- Hypervisor- distinguish multiple VMs running on it and isolate them from the underlying h/w? The function of partitioning, or more specifically, abstracting and isolating these different OS and applications from the underlying computer hardware is what the hypervisor does. What this means is that the underlying hardware (which is known as the host machine) can independently operate and run one or more virtual machines (known as guest machines). The hypervisor also helps manage these independent Virtual Machines by distributing hardware resources such as memory allotment, CPU usage network bandwidth and more amongst them. It does this by creating pools of abstracted hardware resources, which it then allocates to Virtual Machines. It also can stop and start virtual machines, when requested by the user. Another key component of hypervisors is ensuring that all the Virtual Machines stay isolated from others. There are 2 types of Hypervisors. They’re also referred to as Native or Bare Metal Hypervisors (Type 1) and Hosted Hypervisors (Type 2). Type 1 hypervisors run on the host machine’s hardware directly, without the intervention of an underlying Operating System. This means that the hypervisor has direct hardware access without contending with the Operating System and drivers. Type 2: The hypervisor runs as an application within the Operating System, which then runs directly on the host computer. Type 2 hypervisors do support multiple guest machines but are not allowed to directly access the host hardware and its resources. The pre-existing Operating System manages the calls to the CPU for memory, network resources and storage. All of this can create a certain amount of latency.
- Virtualization: Virtualization is the creation of a “virtual” form of a resource, such as a server, a desktop, an operating system, storage space, network or files. With virtualization, traditional computing is transformed, as these resources become scalable as per a client or organization’s needs. split into three distinct types – Operating System (OS) virtualization, hardware virtualization and server virtualization. ***[Virtualization](https://blog.resellerclub.com/what-is-virtualization-and-how-does-it-work/)*** is used to consolidate workloads, systems and multiple operating environments on one single physical system. Essentially the underlying hardware is partitioned, and each partition runs as a separate, isolated Virtual Machine – which has its own Operating System.
- Content delivery network: A content delivery network is a system of distributed servers (network) that deliver pages and other web content to a user, based on the geographic locations of the user, the origin of the webpage and the content delivery server. Servers nearest to the website visitor respond to the request. The content delivery network copies the pages of a website to a network of servers that are dispersed at geographically different locations, caching the contents of the page. When a user requests a webpage that is part of a content delivery network, the CDN will redirect the request from the originating site's server to a server in the CDN that is closest to the user and deliver the cached content. CDNs will also communicate with the originating server to deliver any content that has not been previously cached.
- Cluster: Clustering refers to the interconnection of servers in a way that makes them appear to the operating environment as a single system. As such, the cluster draws on the power of all the servers to handle the demanding processing requirements of a broad range of technical applications. It also takes advantage of parallel processing in program execution. Shared resources in a cluster may include physical hardware devices such as disk drives and network cards, TCP/IP addresses, entire applications, and databases. The cluster service is a collection of software on each node that manages all cluster-specific activity, including traffic flow and load balancing. The nodes are linked together by standard Ethernet, FDDI, ATM, or Fibre Channel connections.
- IPSec VS SSL VPN: Internet Protocol Security (IPsec) is the traditional VPN method. Introduced in the 1990s, it is well established, regularly updated, and continues to be widely used. IPsec requires third-party client software on the user’s device to access the VPN. IPsec has two modes of securing data: transport and tunnel. In transport mode, only the payload of an IP packet (that is, the data itself) is encrypted; the header remains intact. In tunnel mode, on the other hand, the entire packet is encrypted and then encapsulated in a new IP packet with a new header. 
SSL VPNs are implemented through the remote user’s web browser and do not require the installation of special software. SSL gives users more specific access than IPsec. Rather than becoming a full member of the network, remote team members are granted access to particular applications. This makes it simple to provide different levels of access to different users. Security is maintained by restricting access to only what’s needed. Like IPsec, SSL has two modes. In portal mode, users access the VPN through a page in their web browser (the portal). In tunnel mode, by contrast, users can access any applications on the network, including ones that are not web based.
- MPLS: Multiprotocol Label Switching (MPLS) is a routing technique in telecommunications networks that directs data from one node to the next based on short path labels rather than long network addresses, thus avoiding complex lookups in a routing table and speeding traffic flows. MPLS works by prefixing packets with an MPLS header, containing one or more labels. This is called a label [stack](https://en.wikipedia.org/wiki/Stack_(data_structure)). Each entry in the label stack contains four fields:
    - A 20-bit label value. A label with the value of 1 represents the [router alert label](https://en.wikipedia.org/wiki/Router_alert_label).
    - a 3-bit Traffic Class field for QoS ([quality of service](https://en.wikipedia.org/wiki/Quality_of_service)) priority and ECN ([Explicit Congestion Notification](https://en.wikipedia.org/wiki/Explicit_Congestion_Notification)). Prior to 2009 this field was called EXP.
    - a 1-bit  flag. If this is set, it signifies that the current label is the last in the stack.
        
        bottom of stack
        
    - an 8-bit TTL ([time to live](https://en.wikipedia.org/wiki/Time_to_live)) field.
- How to speed up a high latency link/high speed link?: Use a different program that doesn't use a TCP-like protocol but still guarantees your data through other mean. Transfer multiple files in parallel.
- CDN - How does a CDN make web sites faster? A CDN stores multiple content types, which can contribute to faster loading times for users. And because the CDN stores this content it can push it to users more quickly. A CDN is designed for scalability so that you can handle changes in traffic (up or down) with ease and without learning of a traffic change because of a website that’s no longer functioning. A CDN is essentially a network of geographically dispersed servers. Each CDN node (also called Edge Servers) caches the static content of a site like the images, CSS/JS files and other structural components. The majority of an end-user’s page load time is spent on retrieving this content, and so it makes sense to provide these “building blocks” of a site in as many server nodes as possible, distributed throughout the world.
- OSI:

[OSI Layers](Solution%20Architect%20Questions/OSI%20Layers.csv)

- Optimize data flow over a high bandwidth/high latency link: TCP optimization increases TCP window size, which puts more data in flight on long latency paths. TCP optimization can also include a variety of actions such as sending pre-emptive data receipt acknowledgements that maintain high throughput to speed data from the source, and ramping up the TCP transmission rate more quickly by bypassing TCP's ‘slow start' function. TCP optimization also uses a selective acknowledgement (SACK) feature that retransmits only bytes lost rather than returning to the last continuously received data.
- Firewalls: Is a [network security](https://en.wikipedia.org/wiki/Network_security) system that [monitors](https://en.wikipedia.org/wiki/Network_monitoring) and controls incoming and outgoing [network traffic](https://en.wikipedia.org/wiki/Network_traffic) based on predetermined security rules. A firewall typically establishes a barrier between a trusted internal network and untrusted external network, such as the [Internet](https://en.wikipedia.org/wiki/Internet). Firewalls are often categorized as either **network firewalls** or **host-based firewalls**. Network firewalls filter traffic between two or more networks and run on network hardware. Host-based firewalls run on host computers and control network traffic in and out of those machines.
- Route 53: Amazon Route 53 is a highly available and scalable cloud Domain Name System (DNS) web service. Amazon Route 53 effectively connects user requests to infrastructure running in AWS – such as Amazon EC2 instances, Elastic Load Balancing load balancers, or Amazon S3 buckets – and can also be used to route users to infrastructure outside of AWS.
- Port numbers for (DNS, HTTP, Telnet): Telnet 23, HTTP 80, HTTPS 443, DNS 53

[Port Numbers](Solution%20Architect%20Questions/Port%20Numbers.csv)

- CIDR: Classless Inter-Domain Routing is a method for allocating IP addresses and for IP routing. CIDR encompasses several concepts. It is based on variable-length subnet masking (VLSM) which allows the specification of arbitrary-length prefixes. Its goal was to slow the growth of routing tables on routers across the Internet, and to help slow the rapid exhaustion of IPv4 addresses. CIDR introduced a new method of representation for IP addresses, now commonly known as CIDR notation, in which an address or routing prefix is written with a suffix indicating the number of bits of the prefix, such as 192.0.2.0/24 for IPv4, and 2001:db8::/32 for IPv6.
- QOS and bandwidth control: Quality of Service (QoS) Policies are interface-specific rules on a Firewall that help you ensure that important network services are given priority over less important traffic. Service quality measurements subject to a QoS implementation are bandwidth (maximum rate of transfer), throughput (actual rate of transfer), latency (delay), and jitter (variance in latency). With QoS rules, you can set up a minimum guaranteed bandwidth and maximum bandwidth limit for traffic, and set a priority value for the traffic. La configuracion para el control de banda ancha se realiza sobre las interfaces de red o router.
- Bastion host: A bastion host is a special-purpose computer on a network specifically designed and configured to withstand attacks. The computer generally hosts a single application, for example a proxy server, and all other services are removed or limited to reduce the threat to the computer. It is hardened in this manner primarily due to its location and purpose, which is either on the outside of a firewall or in a demilitarized zone (DMZ) and usually involves access from untrusted networks or computers. 
These are several examples of bastion host systems/services:
    - [DNS (Domain Name System)](https://en.wikipedia.org/wiki/Domain_Name_System) server
    - [Email](https://en.wikipedia.org/wiki/Email) server
    - [FTP (File Transfer Protocol)](https://en.wikipedia.org/wiki/File_Transfer_Protocol) server
    - [Honeypot](https://en.wikipedia.org/wiki/Honeypot_(computing))
    - [Proxy server](https://en.wikipedia.org/wiki/Proxy_server)
    - [VPN (Virtual Private Network)](https://en.wikipedia.org/wiki/Virtual_Private_Network) server
    - [Web server](https://en.wikipedia.org/wiki/sql_server.md)
    - [Ansible server](https://en.wikipedia.org/w/index.php?title=Ansible_server&action=edit&redlink=1)

# Database

## Difference between SQL and No SQL

- SQL databases are relational, NoSQL are non-relational.
- SQL databases use structured query language and have a predefined schema. NoSQL databases have dynamic schemas for unstructured data.
- SQL databases are vertically scalable, NoSQL databases are horizontally scalable.
- SQL databases are table based, while NoSQL databases are document, key-value, graph or wide-column stores.
- SQL databases are better for multi-row transactions, NoSQL are better for unstructured data like documents or JSON.

[SQL vs NoS](Solution%20Architect%20Questions/SQL%20vs%20NoS.csv)

## Hadoop - explain MapReduce

is a software framework for distributed processing of large data sets on compute clusters of commodity hardware. he primary objective of Map/Reduce is to split the input data set into independent chunks that are processed in a completely parallel manner. The Hadoop MapReduce framework sorts the outputs of the maps, which are then input to the reduce tasks. 

The data goes through the following phases

**Input Splits:**

An input to a MapReduce job is divided into fixed-size pieces called **input splits** Input split is a chunk of the input that is consumed by a single map

**Mapping**

This is the very first phase in the execution of map-reduce program. In this phase data in each split is passed to a mapping function to produce output values. In our example, a job of mapping phase is to count a number of occurrences of each word from input splits (more details about input-split is given below) and prepare a list in the form of <word, frequency>

**Shuffling**

This phase consumes the output of Mapping phase. Its task is to consolidate the relevant records from Mapping phase output. In our example, the same words are clubed together along with their respective frequency.

**Reducing**

In this phase, output values from the Shuffling phase are aggregated. This phase combines values from Shuffling phase and returns a single output value. In short, this phase summarizes the complete dataset.

## Difference between oltp/dw:

Online Transaction Processing - Data Warehouse

![Solution%20Architect%20Questions/Screen_Shot_2020-07-07_at_20.26.07.png](Solution%20Architect%20Questions/Screen_Shot_2020-07-07_at_20.26.07.png)

## Describe how to best organize a data mart database

A DATA MART is focused on a single functional area of an organization and contains a subset of data stored in a Data Warehouse. A Data Mart is a condensed version of Data Warehouse and is designed for use by a specific department, unit or set of users in an organization. E.g., Marketing, Sales, HR or finance. It is often controlled by a single department in an organization.

1. **Dependent**: Dependent data marts are created by drawing data directly from operational, external or both sources.
2. **Independent**: Independent data mart is created without the use of a central data warehouse.
3. **Hybrid**: This type of data marts can take data from data warehouses or operational systems.

Here are the detailed steps to implement a Data Mart:

### **Designing**

Designing is the first phase of Data Mart implementation. It covers all the tasks between initiating the request for a data mart to gathering information about the requirements. Finally, we create the logical and physical design of the data mart.

**The design step involves the following tasks:**

- Gathering the business & technical requirements and Identifying data sources.
- Selecting the appropriate subset of data.
- Designing the logical and physical structure of the data mart.

### **Constructing**

This is the second phase of implementation. It involves creating the physical database and the logical structures.

**This step involves the following tasks:**

- Implementing the physical database designed in the earlier phase. For instance, database schema objects like table, indexes, views, etc. are created.

### **Populating**

In the third phase, data in populated in the data mart.

The populating step involves the following tasks:

- Source data to target data Mapping
- Extraction of source data
- Cleaning and transformation operations on the data
- Loading data into the data mart
- Creating and storing metadata

### A**ccessing**

Accessing is a fourth step which involves putting the data to use: querying the data, creating reports, charts, and publishing them. End-user submit queries to the database and display the results of the queries

**The accessing step needs to perform the following tasks:**

- Set up a meta layer that translates database structures and objects names into business terms. This helps non-technical users to access the Data mart easily.
- Set up and maintain database structures.
- Set up API and interfaces if required

### **Managing**

This is the last step of Data Mart Implementation process. This step covers management tasks such as-

- Ongoing user access management.
- System optimizations and fine-tuning to achieve the enhanced performance.
- Adding and managing fresh data into the data mart.
- Planning recovery scenarios and ensure system availability in the case when the system fails.

## Cluster and Mirroring

Clustering and mirroring are transparent methods for increasing fault tolerant.
Mirroring, described [Mirroring](https://www.ibm.com/support/knowledgecenter/SSGU8G_12.1.0/com.ibm.admin.doc/ids_admin_0796.htm?view=kc#ids_admin_0796), is the mechanism by which a single database server maintains a copy of a specific dbspace on a separate disk. This mechanism protects the data in mirrored dbspaces against disk failure because the database server automatically updates data on both disks and automatically uses the other disk if one of the dbspaces fails.
Alternatively, a cluster duplicates on an entirely separate database server all the data that a database server manages, not just the specified dbspaces. Because clustering involves two separate database servers, it protects the data that these database servers manage, not just against disk failures, but against all types of database server failures, including a computer failure or the catastrophic failure of an entire site.

## Database Caching Server

Caching is a buffering technique that stores frequently-queried data in a temporary memory. It makes data easier to be accessed and reduces workloads for databases. 

**Performance —** Performance is improved by making data easier to be accessed through the cache and reduces workloads for database.

**Scalability —**Workload of backend query is distributed to the cache system which is lower costs and allow more flexibility in processing of data.

**Availability —** If backend database server is unavailable, cache can still provide continuous service to the application, making the system more resilient to failures.

![Solution%20Architect%20Questions/Screen_Shot_2020-07-07_at_20.44.06.png](Solution%20Architect%20Questions/Screen_Shot_2020-07-07_at_20.44.06.png)

## DB Tuning

**Database tuning** describes a group of activities used to optimize and homogenize the performance of a [database](https://en.wikipedia.org/wiki/Database). It usually overlaps with [query](https://en.wikipedia.org/wiki/Query_language) tuning, but refers to design of the database files, selection of the [database management system](https://en.wikipedia.org/wiki/Database_management_system) (DBMS) application, and configuration of the database's environment ([operating system](https://en.wikipedia.org/wiki/operating_system_boot_time.md), [CPU](https://en.wikipedia.org/wiki/CPU), etc.). Database tuning aims to maximize use of system resources to perform work as efficiently and rapidly as possible. Most systems are designed to manage their use of system resources, but there is still much room to improve their efficiency by customizing their settings and configuration for the database and the DBMS. Automatic DB tuning with machine learning

## Sharding

Sharding is a method of splitting and storing a single logical dataset in multiple databases. By distributing the data among multiple machines, a cluster of database systems can store larger dataset and handle additional requests. Sharding is necessary if a dataset is too large to be stored in a single database.

## JSON vs. XML

[JSON vs XML](Solution%20Architect%20Questions/JSON%20vs%20XML.csv)

## How would you provide high availability for a database deployed on an instance in the cloud?

Amazon RDS provides high availability and failover support for DB instances using Multi-AZ deployments. Amazon RDS uses several different technologies to provide failover support. In a Multi-AZ deployment, Amazon RDS automatically provisions and maintains a synchronous standby replica in a different Availability Zone. The primary DB instance is synchronously replicated across Availability Zones to a standby replica to provide data redundancy, eliminate I/O freezes, and minimize latency spikes during system backups.

## Why is it hard to horizontally scale a SQL database?

Horizontal Scaling of data (synonymous to sharding) is referred as splitting row wise into multiple tables in order to reduce time taken to fetch data. Key point to note here is as we can see tables in SQL databases are Normalized into multiple tables of related data. In order to shard data of such table on multiple machines, you would need to shard related normalized data accordingly which in turn would increase maintenance efforts. If you move some rows of customer data onto other machine (referred as sharding) you would also need to move its related order data onto the same machine which would be troublesome task in case of multiple related tables.

## How can a database be scaled?

Vertical Scaling of data (synonymous to Normalisation in SQL databases) is referred as splitting data column wise into multiple tables in order to reduce space redundancy. Horizontal Scaling of data (synonymous to sharding) is referred as splitting row wise into multiple tables in order to reduce time taken to fetch data

## What is database indexing and why is it important

Indexing is a way to optimize the performance of a database by minimizing the number of disk accesses required when a query is processed. It is a data structure technique which is used to quickly locate and access the data in a database. Indexes are created using a few database columns. There is an analogy with the index in a book, by looking at it you know where to go in the whole set of data that is embedded in the book.

## What ports do databases use

[Database ports](Solution%20Architect%20Questions/Database%20ports.csv)

# Design

- Build a web site: While there are many websites builders on the web, some guidelines for web design are:
    
    ### **1) Simplicity**
    
    While the look and feel of your website is important, most visitors aren't coming to your site to evaluate how slick the design is. Instead, they're coming to your site to complete some action, or to find some specific piece of information.
    
    ### **2) Visual Hierarchy**
    
    Closely tied to the principle of simplicity, visual hierarchy entails arranging and organizing website elements so that visitors naturally gravitate toward the most important elements first.
    
    ### **3) Navigability**
    
    Having intuitive navigation on your site is crucial for ensuring visitors can find what they're looking for. Ideally, a visitor should be able to arrive on your site and not have to think extensively about where they should click next -- moving from point A to point B should be as pain-free as possible.
    
    ### **4) Consistency**
    
    In addition to keeping your site's navigation consistent, the overall look and feel of your site should be consistent across all of your site's pages. Backgrounds, color schemes, typefaces, and even the tone of your writing are all areas where being consistent can have a positive impact on usability and UX.
    
    ### **5) Accessibility**
    
    **[According to comScore](https://www.comscore.com/Insights/Presentations-and-Whitepapers/2016/2016-US-Cross-Platform-Future-in-Focus)**, tablet internet consumption grew 30% between 2013 and 2015. Smartphone internet consumption, meanwhile, grew 78% during the same time period. The takeaway here: In order to provide a truly great user experience, your site needs to be compatible with the different devices (and operating systems, *and* browsers) that your visitors are using.
    
    ### **6) Conventionality**
    
    There are certain web design conventions which, over the years, internet users have become increasingly familiar with. Such conventions include:
    
    - Having the main navigation be at the top (or left side) of a page
    - Having a logo at the top left (or center) of a page
    - Having that logo be clickable so it always brings a visitor back to the homepage
    - Having links change color/appearance when you hover over them
    
    ### **7) Credibility**
    
    Ultimately, using web design conventions -- design elements and strategies that visitors are already familiar with -- can help give your site more credibility. And if you're striving to build a site that provides the best user experience possible, credibility (a.k.a. the amount of trust your site conveys) can go a long way.
    
    ### **8) User-Centricity**
    
    At the end of the day, usability and user experience hinge on the preferences of the end users. (After all, if you're not designing for them ... who are you designing for?)
    
- Design a solution architecture for a web based small company? One such trend is the use of and creation of [service-oriented architecture](https://msdn.microsoft.com/en-us/library/aa480021.aspx). This is where most of the code for the entire application exists as services. In addition, each has its own HTTP API. As a result, one facet of the code can make a request to another part of the code–which may be running on a different server. Another trend is a single-page application. This is where web UI is presented through a rich JavaScript application. It then stays in the user’s browser over a variety of interactions.
    
    ### Best Practices for Good Web Application Architecture
    
    You may have a working app, but it also needs to have good web architecture. Here are several attributes necessary for good web application architecture:
    
    - Solves problems consistently and uniformly
    - Is as simple as possible
    - Supports the latest standards include A/B testing and analytics
    - Offers fast response times
    - Utilizes security standards to reduce the chance of malicious penetrations
    - Does not crash
    - Heals itself
    - Does not have a single point of failure
    - Scales out easily
    - Allows for easy creation of known data
    - Errors logged in a user-friendly way
    - Automated deployments
    
    ![Solution%20Architect%20Questions/Screen_Shot_2020-07-08_at_09.45.21.png](Solution%20Architect%20Questions/Screen_Shot_2020-07-08_at_09.45.21.png)
    
- Design fault tolerant, load balanced video stream service: You get improved fault tolerance by placing your compute instances behind an Elastic Load Balancer, as it can automatically balance traffic across multiple instances and multiple Availability Zones and ensure that only healthy Amazon EC2 instances receive traffic. A server can be made fault tolerant by using an identical server running in parallel, with all operations mirrored to the backup server. Software systems that are backed up by other software instances. For example, a database with customer information can be continuously replicated to another machine.
- Plan an e-commerce site for a small business
- Describe how you would architect a very critical website on the cloud?
    
    **Think Adaptive and Elastic**
    
    The AWS cloud architecture should be such that it support growth of users, traffic, or data size with no drop in performance. It should also allow for linear scalability when and where an additional resource is added. The system needs to be able to adapt and proportionally serve additional load. Whether the AWS cloud architecture includes vertical scaling, horizontal scaling or both; it is up to the designer, depending on the type of application or data to be stored. But your design should be equipped to take maximum advantage of the virtually unlimited on-demand capacity of cloud computing.
    
    **Treat servers as disposable resources**
    
    One of the biggest advantages of cloud computing is that you can treat your servers as disposable resources instead of fixed components. However, resources should always be consistent and tested. One way to enable this is to implement the immutable infrastructure pattern, which enables you to replace the server with one that has the latest configuration instead of updating the old server.
    
    **Automate Automate Automate**
    
    Unlike traditional IT infrastructure, Cloud enables automation of a number of events, improving both your system’s stability and the efficiency of your organization. Some of the AWS resources you can use to get automated are:
    
    - **AWS Elastic Beanstalk:** This resource is the fastest and simplest way to get an application up and running on AWS. You can simply upload their application code and the service automatically handles all the details, such as resource provisioning, load balancing, auto scaling, and monitoring.
    - **Amazon EC2 Auto recovery:** You can create an Amazon CloudWatch alarm that monitors an Amazon EC2 instance and automatically recovers it if it becomes impaired. But a word of caution – During instance recovery, the instance is migrated through an instance reboot, and any data that is in-memory is lost.
    - **Auto Scaling**: With [Auto Scaling](https://aws.amazon.com/autoscaling/), you can maintain application availability and scale your Amazon EC2 capacity up or down automatically according to conditions you define.
    - **Amazon CloudWatch Alarms**: You can create a [CloudWatch alarm](http://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html) that sends an Amazon Simple Notification Service (Amazon SNS) message when a particular metric goes beyond a specified threshold for a specified number of periods.
    - **Amazon CloudWatch Events**: The CloudWatch service delivers a near real-time stream of system events that describe changes in AWS resources. Using simple rules that you can set up in a couple of minutes, you can easily route each type of event to one or more targets: AWS Lambda functions, Amazon Kinesis streams, Amazon SNS topics, etc.
    - **AWS OpsWorks Lifecycle events**: [AWS OpsWorks](https://aws.amazon.com/opsworks/) supports continuous configuration through lifecycle events that automatically update your instances’ configuration to adapt to environment changes. These events can be used to trigger Chef recipes on each instance to perform specific configuration tasks.
    - **AWS Lambda Scheduled events**: These events allow you to create a Lambda function and direct AWS Lambda to execute it on a regular schedule.
    
    **Implement loose coupling**
    
    IT systems should ideally be designed in a way that reduces inter-dependencies. Your components need to be loosely coupled to avoid changes or failure in one of the components from affecting others.
    
    Your infrastructure also needs to have well defined interfaces that allow the various components to interact with each other only through specific, technology-agnostic interfaces. Modifying any underlying operations without affecting other components should be made possible.
    
    **Focus on services, not servers**
    
    A wide variety of underlying technology components are required to develop manage and operate applications. Your AWS cloud architecture should leverage a broad set of compute, storage, database, analytics, application, and deployment services. On AWS, there are two ways to do that. The first is through managed services that include databases, [machine learning](https://www.botmetric.com/blog/machine-learning-impact-on-cloud-computing/), analytics, queuing, search, email, notifications, and more. For example, with the Amazon Simple Queue Service ([Amazon SQS](https://aws.amazon.com/sqs/)) you can offload the administrative burden of operating and scaling a highly available messaging cluster, while paying a low price for only what you use. The second way is to reduce the operational complexity of running applications through server-less architectures. It is possible to build both event-driven and synchronous services for mobile, web, analytics, and the Internet of Things (IoT) without managing any server infrastructure.
    
    **Database is the base of it all**
    
    On AWS, managed database services help remove constraints that come with licensing costs and the ability to support diverse database engines that were a problem with the traditional IT infrastructure. You need to keep in mind that access to the information stored on these databases is the main purpose of cloud computing.
    
    There are three different categories of databases to keep in mind while architecting:
    
    - **Relational databases** – Data here is normalized into tables and also provided with powerful query language, flexible indexing capabilities, strong integrity controls, and the ability to combine data from multiple tables in a fast and efficient manner. They can be scaled vertically and are highly available during failovers (designed for graceful failures).
    - **NoSQL databases**– These databases trade some of the query and transaction capabilities of relational databases for a more flexible data model that seamlessly scales horizontally. NoSQL databases utilize a variety of data models, including graphs, key-value pairs, and JSON documents. NoSQL databases are widely recognized for ease of development, scalable performance, high availability, and resilience.
    - **Data warehouse** – A specialized type of relational database, optimized for analysis and reporting of large amounts of data. It can be used to combine transactional data from disparate sources making them available for analysis and decision-making.
    
    **Be sure to remove single points of failure**
    
    A system is highly available when it can withstand the failure of an individual or multiple components (e.g., hard disks, servers, network links etc.). You can think about ways to automate recovery and reduce disruption at every layer of your AWS cloud architecture. This can be done with the following processes:
    
    - Introduce redundancy to remove single points of failure, by having multiple resources for the same task. Redundancy can be implemented in either standby mode (functionality is recovered through failover while the resource remains unavailable) or active mode (requests are distributed to multiple redundant compute resources, and when one of them fails, the rest can simply absorb a larger share of the workload).
    - Detection and reaction to failure should both be automated as much as possible.
    - It is crucial to have a durable data storage that protects both data availability and integrity. Redundant copies of data can be introduced either through synchronous, asynchronous or Quorum based replication.
    - Automated Multi –Data Center resilience is practiced through Availability Zones across data centers that reduce the impact of failures.Fault isolation improvement can be made to traditional horizontal scaling by sharding (a method of grouping instances into groups called shards, instead of sending the traffic from all users to every node like in the traditional IT structure.)
    
    **Optimize for cost**
    
    At the end of the day, it often boils down to cost. Your AWS cloud architecture should be designed for cost optimization by keeping in mind the following principles:
    
    - You can reduce cost by selecting the right types, configurations and storage solutions to suit your needs.Implementing Auto Scaling so that you can scale horizontally when required or scale down when necessary can be done without any extra cost.
    - Taking advantage of the variety of [Instance Purchasing options](http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-purchasing-options.html) (Reserved and spot instances) while buying EC2 instances will help reduce cost on computing capacity.
    
    **Caching**
    
    Applying data caching to multiple layers of your AWS cloud architecture can improve application performance and cost efficiency of application. There are two types of caching:
    
    - Application data caching- Information can be stored and retrieved from fast, managed, in-memory caches in the application, which decreases load for the database and increases latency for end users.
    - Edge caching – Content is served by infrastructure that is closer to the viewers lowering latency and giving you the high, sustained data transfer rates needed to deliver large popular objects to end users at scale.
    - [Amazon CloudFront](http://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html), the content delivery network consisting of multiple edge locations around the world is the edge caching service whereas [Amazon ElastiCache](https://aws.amazon.com/elasticache/) makes it easy to deploy, operate and scale in-memory cache in the cloud.
    
    **AWS Cloud Architecture Security**
    
    [Cloud Security](https://www.botmetric.com/cloud-security-compliance/) is everything! Most of the security tools and techniques used in the traditional IT infrastructure can be used in the cloud as well. AWS is a platform that allows you to formalize the design of security controls in the platform itself. It simplifies system use for administrators and those running IT, and makes your environment much easier to audit in a continuous manner. Some ways to improve security in AWS are:
    
    - Utilize AWS features for Defense in depth – Starting at the network level, you can build a VPC topology that isolates parts of the infrastructure through the use of subnets, security groups, and routing controls.
    - AWS operates under a shared security responsibility model, where AWS is responsible for the security of the underlying cloud infrastructure and you are responsible for securing the workloads you deploy in AWS.
    - Reduce privileged access to the programmable resources and servers to avoid breach of security. The overuse of guest operating systems and service accounts can breach security.
    - Create an AWS Cloud Formation script that captures your security policy and reliably deploys it, allowing you to perform security testing as part of your release cycle, and automatically discover application gaps and drift from your security policy.
    - Testing and auditing your environment is key to moving fast while staying safe. On AWS, it is possible to implement continuous monitoring and automation of controls to minimize exposure to security risks. Services like AWS Config, [Amazon Inspector](https://aws.amazon.com/inspector/), and [AWS Trusted Advisor](https://aws.amazon.com/premiumsupport/trustedadvisor/) continually monitor for compliance or vulnerabilities giving you a clear overview of which IT resources are in compliance, and which are not.
- Given that you have a content rich E-commerce website, what kind of Storage Tier would you use to support the website?
- Draw a hybrid solutions for an enterprise customer that needs to store files online in a private cloud with 99.95% SLA and specify which AWS component you will need to use and details about security, access control etc
- There is a customer from the relevant domain (for me, it was public sector) that wants to create a site that shows some information, and also, push alerts for the end-users. Expecting Millions of end-users. Describe how to build this application. Consider - security, scalability and availability.
- Describe a web application and all of its components: The web application architecture describes the interactions between applications, databases, and middleware systems on the web. It ensures that multiple applications work simultaneously.
    
    As soon as the user hits the go button after typing a URL in the address bar of a web browser, it requests for that particular web address. The server sends files to the browser as a response to the request made. The browser then executes those files to show the requested page.
    
    Finally, the user is able to interact with the website. The most important thing to note here is the code parsed by the web browser. A web app works in a similar way.
    
    This code might or might not have specific instructions that tell the browser how to respond with respect to the different types of user inputs.
    
    Hence, a web application architecture has to include all the sub-components as well as the external applications interchanges for the entire software application, in the aforementioned case, which is a website.
    
    The web application architecture is indispensable in the modern world because a major portion of the global network traffic, as well as most of the apps and devices, make use of web-based communication.
    
    A web application architecture has to not only deal with efficiency, but also with reliability, scalability, security, and robustness.
    
    ### **Web Application Components**
    
    When we say web application components, we can mean any of the following two:
    
    - **UI/UX Web Application Components –** This includes activity logs, dashboards, notifications, settings, statistics, etc. These components have nothing to do with the operation of a web application architecture. Instead, they are part of the interface layout plan of a web app.
    - **Structural Components –** The two major structural components of a web app are client and server sides.
    - **Client Component -** The client component is developed in CSS, HTML, and JS. As it exists within the user’s web browser, there is no need for operating system or device-related adjustments. The client component is a representation of a web application’s functionality that the end-user interacts with.
    - **Server Component -** The server component can be build using one or a combination of [several programming languages](https://hackr.io/blog/best-programming-languages-to-learn-2020-jobs-future) and frameworks, including Java, .Net, NodeJS, PHP, Python, and Ruby on Rails. The server component has at least two parts; app logic and database. The former is the main control center of the web application while the latter is where all the persistent data is stored.
- What if Google decides to host [youtube.com](http://youtube.com/) on AWS, how do you design your solution?

# Architecture

- SOA:
    
    Service-Oriented Architecture (SOA) is an architectural approach in which applications make use of services available in the network. In this architecture, services are provided to form applications, through a communication call over the internet.
    
    - SOA allows users to combine a large number of facilities from existing services to form applications.
    - SOA encompasses a set of design principles that structure system development and provide means for integrating components into a coherent and decentralized system.
    - SOA based computing packages functionalities into a set of interoperable services, which can be integrated into different software systems belonging to separate business domains.
    
    There are two major roles within Service-oriented Architecture:
    
    1. **Service provider:** The service provider is the maintainer of the service and the organization that makes available one or more services for others to use. To advertise services, the provider can publish them in a registry, together with a service contract that specifies the nature of the service, how to use it, the requirements for the service, and the fees charged.
    2. **Service consumer:** The service consumer can locate the service metadata in the registry and develop the required client components to bind and use the service.
- horizontal vs vertical scaling: **Horizontal scaling means that you scale by adding more machines** into your pool of resources whereas **Vertical scaling means that you scale by adding more power (CPU, RAM) to an existing machine**. An easy way to remember this is to think of a machine on a server rack, we add more machines across the **horizontal** direction and add more resources to a machine in the **vertical** direction.
- LAMP stack: Short for Linux, Apache, MySQL and PHP, an open-source Web development platform, also called a Web stack, that uses Linux as the operating system, Apache as the Web server, MySQL as the RDBMS and PHP as the object-oriented scripting language. Perl or Python is often substituted for PHP.
- HA Architecture: High Availability (HA) configuration or architecture. High availability architecture is an approach of defining the components, modules or implementation of services of a system which ensures optimal operational performance, even at times of high loads. Modern designs allow for distribution of the workloads across multiple instances such as a network or a cluster, which helps in optimizing resource use, maximizing output, minimizing response times and avoiding overburden of any system in the process known as load balancing. It also involves switching to a standby resource like a server, component or network in the case of failure of an active one, known as Failover systems. Use of Multiple Application Servers, Scaling Databases, Diversified Geographical Locations. Best practices include: Data Backups, Recovery and Replication, Clustering, Network Load Balancing, Fail Over Solutions, Geographic redundancy, Plan for failure
- Lambda Architecture: is a data-processing architecture designed to handle massive quantities of data by taking advantage of both batch and stream-processing methods. This approach to architecture attempts to balance latency, throughput, and fault-tolerance by using batch processing to provide comprehensive and accurate views of batch data, while simultaneously using real-time stream processing to provide views of online data. Lambda architecture describes a system consisting of three layers: batch processing, speed (or real-time) processing, and a serving layer for responding to queries.

# Computer Science

- What does kernel do difference between java & C:
    
    1. JAVA is Object-Oriented while C is procedural. Different Paradigms, that is, although they can also be understood as multi paradigm languages.
    
    Most differences between the features of the two languages arise due to the use of different programming paradigms. C breaks down to functions while JAVA breaks down to Objects. C is more procedure-oriented while JAVA is data-oriented.
    
    2. Java is an Interpreted language while C is a compiled language.
    
    We all know what a compiler does. It takes your code & translates it into something the machine can understand-that is to say-0 & 1’s-the machine-level code. That’s exactly what happens with our C code-it gets ‘compiled’. While with JAVA, the code is first transformed to what is called the byte code. This byte code is then executed by the JVM (Java Virtual Machine). For the same reason, JAVA code is more portable.
    
    3. C is a low-level language while JAVA is a high-level language.
    
    C is a low-level language (difficult interpretation for the user, closer significance to the machine-level code) while JAVA is a high-level language (abstracted from the machine-level details, closer significance to the program itself).
    
    4. C uses the top-down {sharp & smooth} approach while JAVA uses the bottom-up {on the rocks} approach.
    
    In C, formulating the program begins by defining the whole and then splitting them into smaller elements. JAVA (and C++ and other OOP languages) follows the bottom-up approach where the smaller elements combine together to form the whole.
    
    5. Pointer go backstage in JAVA while C requires explicit handling of pointers.
    
    When it comes to JAVA, we don’t need the *’s & &’s to deal with pointers & their addressing. More formally, there is no pointer syntax required in JAVA. It does what it needs to do. While in JAVA, we do create references for objects.
    
    6. The Behind-the-scenes Memory Management with JAVA & the User-Based Memory Management in C.
    
    Remember ‘malloc’ & ‘free’? Those are the library calls used in C to allocate & free chunks of memory for specific data (specified using the keyword ‘size of’). Hence in C, the memory is managed by the user while JAVA uses a garbage collector that deletes the objects that no longer have any references to them.
    
    7. JAVA supports Method Overloading while C does not support overloading at all.
    
    JAVA supports function or method overloading-that is we can have two or more functions with the same name (with certain varying parameters like return types to allow the machine to differentiate between them). That is to say, we can overload methods with the same name having different method signatures. JAVA (unlike C++), does not support Operator Overloading while C does not allow overloading at all.
    
    8. Unlike C, JAVA does not support Pre-processors, & does not really them.
    
    The pre-processor directives like #include & #defines, etc is considered one of the most essential elements of C programming. However, there are no pre-processors in JAVA. JAVA uses other alternatives for the pre-processors. For instance, public static final is used instead of the #define pre-processor. Java maps class names to a directory and file structure instead of the #include used to include files in C.
    
    9. The standard Input & Output Functions.
    
    Although this difference might not hold any conceptual (intuitive) significance, but it’s maybe just the tradition. C uses the printf & scanf functions as its standard input & output while JAVA uses the System.out.print & System(dot)in.read functions.
    
    10. Exception Handling in JAVA and the errors & crashes in C.
    
    When an error occurs in a Java program it results in an exception being thrown. It can then be handled using various exception handling techniques. While in C, if there’s an error, there IS an error.
    
- OOP: Object-oriented programming (OOP) is a programming paradigm based on the concept of "objects", which can contain data, in the form of fields (often known as attributes or properties), and code, in the form of procedures (often known as methods). A feature of objects is an object's procedures that can access and often modify the data fields of the object with which they are associated (objects have a notion of "this" or "self"). In OOP, computer programs are designed by making them out of objects that interact with one another
- Continuous integration: Continuous Integration (CI) is a development practice where developers integrate code into a shared repository frequently, preferably several times a day. Each integration can then be verified by an automated build and automated tests. While automated testing is not strictly part of CI it is typically implied. One of the key benefits of integrating regularly is that you can detect errors quickly and locate them more easily. As each change introduced is typically small, pinpointing the specific change that introduced a defect can be done quickly.
- Continuous development: is closely related to Continuous Integration and refers to keeping your application deployable at any point or even automatically releasing to a test or production environment if the latest version passes all automated tests.
- CI/CD tools:
    
    ## **Collaborative →**
    
    ### [Application Lifecycle Management](https://www.plutora.com/ci-cd-tools/application-lifecycle-management-tools)
    
    - [Aha!](https://www.plutora.com/ci-cd-tools/application-lifecycle-management-tools/aha)
    - [VersionOne](https://www.plutora.com/ci-cd-tools/application-lifecycle-management-tools/collabnet-versionone)
    - [Phabricator](https://www.plutora.com/ci-cd-tools/application-lifecycle-management-tools/phabricator)
    - [Asana](https://www.plutora.com/ci-cd-tools/application-lifecycle-management-tools/asana)
    - [Pivotal Tracker](https://www.plutora.com/ci-cd-tools/application-lifecycle-management-tools/pivotal-tracker)
    - [Basecamp](https://www.plutora.com/ci-cd-tools/application-lifecycle-management-tools/base-camp)
    - [Visual Studio](https://www.plutora.com/ci-cd-tools/application-lifecycle-management-tools/visual-studio)
    - [Trello](https://www.plutora.com/ci-cd-tools/application-lifecycle-management-tools/trello)
    - [Mingle](https://www.plutora.com/ci-cd-tools/application-lifecycle-management-tools/mingle)
    - [Jira Software](https://www.plutora.com/ci-cd-tools/application-lifecycle-management-tools/jira)
    
    ### [Communications & ChatOps](https://www.plutora.com/ci-cd-tools/communication-chatops-tools)
    
    - [Gitter](https://www.plutora.com/ci-cd-tools/communication-chatops-tools/gitter)
    - [Hubot](https://www.plutora.com/ci-cd-tools/communication-chatops-tools/hubot)
    - [Lita](https://www.plutora.com/ci-cd-tools/communication-chatops-tools/lita)
    - [IRC](https://www.plutora.com/ci-cd-tools/communication-chatops-tools/irc)
    - [Rocket.chat](https://www.plutora.com/ci-cd-tools/communication-chatops-tools/rocket-chat)
    - [Mattermost](https://www.plutora.com/ci-cd-tools/communication-chatops-tools/mattermost)
    - [Ryver](https://www.plutora.com/ci-cd-tools/communication-chatops-tools/ryver)
    - [Microsoft Teams](https://www.plutora.com/ci-cd-tools/communication-chatops-tools/microsoft-teams)
    - [Flowdock](https://www.plutora.com/ci-cd-tools/communication-chatops-tools/flowdock)
    - [HipChat](https://www.plutora.com/ci-cd-tools/communication-chatops-tools/hipchat)
    - [Slack](https://www.plutora.com/ci-cd-tools/communication-chatops-tools/slack)
    
    ### [Knowledge Management](https://www.plutora.com/ci-cd-tools/knowledge-management-tools)
    
    - [Discourse](https://www.plutora.com/ci-cd-tools/knowledge-management-tools/discourse)
    - [Graphviz](https://www.plutora.com/ci-cd-tools/knowledge-management-tools/graphviz)
    - [Flarum](https://www.plutora.com/ci-cd-tools/knowledge-management-tools/flarum)
    - [RAML](https://www.plutora.com/ci-cd-tools/knowledge-management-tools/raml)
    - [Read the Docs](https://www.plutora.com/ci-cd-tools/knowledge-management-tools/read-the-docs)
    - [Jekyll](https://www.plutora.com/ci-cd-tools/knowledge-management-tools/jekyll)
    - [Open API](https://www.plutora.com/ci-cd-tools/knowledge-management-tools/open-api)
    - [API Blueprint](https://www.plutora.com/ci-cd-tools/knowledge-management-tools/apiblueprint)
    - [Hugo](https://www.plutora.com/ci-cd-tools/knowledge-management-tools/hugo)
    - [Confluence](https://www.plutora.com/ci-cd-tools/knowledge-management-tools/confluence)
    - [Github: Pages](https://www.plutora.com/ci-cd-tools/knowledge-management-tools/githubpages)
    
    ## **Build →**
    
    ### [Version Control](https://www.plutora.com/ci-cd-tools/version-control-tools)
    
    - [Kallithea](https://www.plutora.com/ci-cd-tools/version-control-tools/kallithea)
    - [Beanstalk](https://www.plutora.com/ci-cd-tools/version-control-tools/beanstalk)
    - [GitBucket](https://www.plutora.com/ci-cd-tools/version-control-tools/gitbucket)
    - [Mercurial](https://www.plutora.com/ci-cd-tools/version-control-tools/mercurial)
    - [Gogs](https://www.plutora.com/ci-cd-tools/version-control-tools/gogs)
    - [GitLab](https://www.plutora.com/ci-cd-tools/version-control-tools/gitlab)
    - [Bitbucket](https://www.plutora.com/ci-cd-tools/version-control-tools/bitbucket)
    - [GitHub](https://www.plutora.com/ci-cd-tools/version-control-tools/github)
    - [Subversion](https://www.plutora.com/ci-cd-tools/version-control-tools/session.md)
    - [Git](https://www.plutora.com/ci-cd-tools/version-control-tools/git)
    
    ### [Continuous Integration](https://www.plutora.com/ci-cd-tools/continuous-integration-tools)
    
    - [DeployPlace](https://www.plutora.com/ci-cd-tools/continuous-integration-tools/deployplace)
    - [Buddy](https://www.plutora.com/ci-cd-tools/continuous-integration-tools/buddy)
    - [Semaphore](https://www.plutora.com/ci-cd-tools/continuous-integration-tools/semaphore)
    - [GoCD](https://www.plutora.com/ci-cd-tools/continuous-integration-tools/gocd)
    - [Drone.io](https://www.plutora.com/ci-cd-tools/continuous-integration-tools/drone-io)
    - [TeamCity](https://www.plutora.com/ci-cd-tools/continuous-integration-tools/team-city)
    - [Wercker](https://www.plutora.com/ci-cd-tools/continuous-integration-tools/wercker)
    - [Codeship](https://www.plutora.com/ci-cd-tools/continuous-integration-tools/codeship)
    - [Travis CI](https://www.plutora.com/ci-cd-tools/continuous-integration-tools/travis-ci)
    - [CircleCI](https://www.plutora.com/ci-cd-tools/continuous-integration-tools/circle-ci)
    - [Bamboo](https://www.plutora.com/ci-cd-tools/continuous-integration-tools/bamboo)
    - [Jenkins](https://www.plutora.com/ci-cd-tools/continuous-integration-tools/jenkins)
    
    ### [Software Build](https://www.plutora.com/ci-cd-tools/software-build-tools)
    
    - [Leiningen](https://www.plutora.com/ci-cd-tools/software-build-tools/leiningen)
    - [Packer](https://www.plutora.com/ci-cd-tools/software-build-tools/packer)
    - [Gulp](https://www.plutora.com/ci-cd-tools/software-build-tools/gulp)
    - [NAnt](https://www.plutora.com/ci-cd-tools/software-build-tools/nant)
    - [Grunt](https://www.plutora.com/ci-cd-tools/software-build-tools/grunt)
    - [Ant](https://www.plutora.com/ci-cd-tools/software-build-tools/apache-ant)
    - [Maven](https://www.plutora.com/ci-cd-tools/software-build-tools/maven)
    - [Docker](https://www.plutora.com/ci-cd-tools/software-build-tools/docker)
    - [Gradle](https://www.plutora.com/ci-cd-tools/software-build-tools/gradle)
    - [SBT](https://www.plutora.com/ci-cd-tools/software-build-tools/sbt)
    
    ### [Database Management](https://www.plutora.com/ci-cd-tools/database-management-tools)
    
    - [MySQL](https://www.plutora.com/ci-cd-tools/database-management-tools/mysql)
    - [MongoDB](https://www.plutora.com/ci-cd-tools/database-management-tools/mongodb)
    - [Liquibase](https://www.plutora.com/ci-cd-tools/database-management-tools/liquibase)
    - [Redgate](https://www.plutora.com/ci-cd-tools/database-management-tools/redgate)
    - [Flyway](https://www.plutora.com/ci-cd-tools/database-management-tools/flyway)
    - [DBmaestro](https://www.plutora.com/ci-cd-tools/database-management-tools/dbmaestro)
    
    ## **Test →**
    
    ### [Testing](https://www.plutora.com/ci-cd-tools/testing-tools)
    
    - [Ranorex](https://www.plutora.com/ci-cd-tools/testing-tools/ranorex)
    - [SoapUI](https://www.plutora.com/ci-cd-tools/testing-tools/soapui)
    - [Katalon Studio](https://www.plutora.com/ci-cd-tools/testing-tools/katalon)
    - [ThreatModeler](https://www.plutora.com/ci-cd-tools/testing-tools/threatmodeler)
    - [Checkmarx](https://www.plutora.com/ci-cd-tools/testing-tools/checkmarx)
    - [RSpec](https://www.plutora.com/ci-cd-tools/testing-tools/rspec)
    - [SpecFlow](https://www.plutora.com/ci-cd-tools/testing-tools/specflow)
    - [Pa11y](https://www.plutora.com/ci-cd-tools/testing-tools/pa11y)
    - [Browsersync](https://www.plutora.com/ci-cd-tools/testing-tools/browsersync)
    - [Serverspec](https://www.plutora.com/ci-cd-tools/testing-tools/serverspec)
    - [pytest](https://www.plutora.com/ci-cd-tools/testing-tools/pytest)
    - [BlazeMeter](https://www.plutora.com/ci-cd-tools/testing-tools/blazemeter)
    - [Load Impact](https://www.plutora.com/ci-cd-tools/testing-tools/load-impact)
    - [Galen Framework](https://www.plutora.com/ci-cd-tools/testing-tools/galen-framework)
    - [TestNG](https://www.plutora.com/ci-cd-tools/testing-tools/testng)
    - [QUnit](https://www.plutora.com/ci-cd-tools/testing-tools/qunit)
    - [NUnit](https://www.plutora.com/ci-cd-tools/testing-tools/nunit)
    - [FitNesse](https://www.plutora.com/ci-cd-tools/testing-tools/fitnesse)
    - [Karma](https://www.plutora.com/ci-cd-tools/testing-tools/karma)
    - [Gatling](https://www.plutora.com/ci-cd-tools/testing-tools/gatling)
    - [OWASP ZAP](https://www.plutora.com/ci-cd-tools/testing-tools/owasp-zap)
    - [Gauntlt](https://www.plutora.com/ci-cd-tools/testing-tools/gauntlt)
    - [Mocha](https://www.plutora.com/ci-cd-tools/testing-tools/mocha)
    - [Jmeter](https://www.plutora.com/ci-cd-tools/testing-tools/jmeter)
    - [Cucumber](https://www.plutora.com/ci-cd-tools/testing-tools/cucumber)
    - [JUnit](https://www.plutora.com/ci-cd-tools/testing-tools/junit)
    - [Jasmine](https://www.plutora.com/ci-cd-tools/testing-tools/jasmine)
    - [Selenium](https://www.plutora.com/ci-cd-tools/testing-tools/selenium-automation)
    
    ## **Deploy →**
    
    ### [Deployment](https://www.plutora.com/ci-cd-tools/deployment-tools)
    
    - [Juju](https://www.plutora.com/ci-cd-tools/deployment-tools/juju)
    - [Rundeck](https://www.plutora.com/ci-cd-tools/deployment-tools/rundeck)
    - [Spinnaker](https://www.plutora.com/ci-cd-tools/deployment-tools/spinnaker)
    - [UrbanCode](https://www.plutora.com/ci-cd-tools/deployment-tools/urban-code)
    - [Capistrano](https://www.plutora.com/ci-cd-tools/deployment-tools/capistrano)
    - [XL Deploy](https://www.plutora.com/ci-cd-tools/deployment-tools/xl-deploy)
    - [Octopus Deploy](https://www.plutora.com/ci-cd-tools/deployment-tools/octopus-deploy)
    
    ### [Configuration Management](https://www.plutora.com/ci-cd-tools/configuration-management-tools)
    
    - [RUDDER](https://www.plutora.com/ci-cd-tools/configuration-management-tools/rudder)
    - [Vagrant](https://www.plutora.com/ci-cd-tools/configuration-management-tools/vagrant)
    - [CFEngine](https://www.plutora.com/ci-cd-tools/configuration-management-tools/cfengine)
    - [Terraform](https://www.plutora.com/ci-cd-tools/configuration-management-tools/terraform)
    - [SaltStack](https://www.plutora.com/ci-cd-tools/configuration-management-tools/saltstack)
    - [Ansible](https://www.plutora.com/ci-cd-tools/configuration-management-tools/ansible)
    - [Chef](https://www.plutora.com/ci-cd-tools/configuration-management-tools/chef)
    - [Puppet](https://www.plutora.com/ci-cd-tools/configuration-management-tools/puppet-labs)
    
    ### [Artifacts Management](https://www.plutora.com/ci-cd-tools/artifacts-management-tools)
    
    - [MyGet](https://www.plutora.com/ci-cd-tools/artifacts-management-tools/myget)
    - [CloudRepo](https://www.plutora.com/ci-cd-tools/artifacts-management-tools/cloudrepo)
    - [Yarn](https://www.plutora.com/ci-cd-tools/artifacts-management-tools/yarn)
    - [npm](https://www.plutora.com/ci-cd-tools/artifacts-management-tools/npm)
    - [PyPI](https://www.plutora.com/ci-cd-tools/artifacts-management-tools/pypi)
    - [Bower](https://www.plutora.com/ci-cd-tools/artifacts-management-tools/bower)
    - [Quay](https://www.plutora.com/ci-cd-tools/artifacts-management-tools/quay)
    - [Nexus](https://www.plutora.com/ci-cd-tools/artifacts-management-tools/nexus)
    - [Archiva](https://www.plutora.com/ci-cd-tools/artifacts-management-tools/archiva)
    - [Nuget](https://www.plutora.com/ci-cd-tools/artifacts-management-tools/nuget)
    - [JFrog Artifactory](https://www.plutora.com/ci-cd-tools/artifacts-management-tools/jfrog-artifactory)
    - [Docker](https://www.plutora.com/ci-cd-tools/artifacts-management-tools/docker-2)
    
    ## **Run →**
    
    ### [IaaS / Cloud](https://www.plutora.com/ci-cd-tools/iaas-tools-cloud-tools)
    
    - [Morpheus](https://www.plutora.com/ci-cd-tools/iaas-tools-cloud-tools/morpheus)
    - [Dokku](https://www.plutora.com/ci-cd-tools/iaas-tools-cloud-tools/dokku)
    - [Engine Yard](https://www.plutora.com/ci-cd-tools/iaas-tools-cloud-tools/engine-yard)
    - [OpenShift](https://www.plutora.com/ci-cd-tools/iaas-tools-cloud-tools/openshift)
    - [Cloud Foundry](https://www.plutora.com/ci-cd-tools/iaas-tools-cloud-tools/cloud-foundry)
    - [Flynn](https://www.plutora.com/ci-cd-tools/iaas-tools-cloud-tools/flynn)
    - [Azure](https://www.plutora.com/ci-cd-tools/iaas-tools-cloud-tools/azure)
    - [OpenStack](https://www.plutora.com/ci-cd-tools/iaas-tools-cloud-tools/open-stack)
    - [Rackspace](https://www.plutora.com/ci-cd-tools/iaas-tools-cloud-tools/rackspace)
    - [Google Cloud Platform](https://www.plutora.com/ci-cd-tools/iaas-tools-cloud-tools/google-cloud-platform)
    - [Heroku](https://www.plutora.com/ci-cd-tools/iaas-tools-cloud-tools/heroku)
    - [Amazon Web Services](https://www.plutora.com/ci-cd-tools/iaas-tools-cloud-tools/amazon-web-services)
    
    ### [Orchestrating & Scheduling](https://www.plutora.com/ci-cd-tools/orchestration-scheduling-tools)
    
    - [Nomad](https://www.plutora.com/ci-cd-tools/orchestration-scheduling-tools/nomad)
    - [Rancher](https://www.plutora.com/ci-cd-tools/orchestration-scheduling-tools/rancher)
    - [Kubernetes](https://www.plutora.com/ci-cd-tools/orchestration-scheduling-tools/kubernetes)
    - [Marathon](https://www.plutora.com/ci-cd-tools/orchestration-scheduling-tools/marathon)
    - [Mesosphere](https://www.plutora.com/ci-cd-tools/orchestration-scheduling-tools/mesosphere)
    
    ### [BI / Monitoring / Logging](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools)
    
    - [Pingdom](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/pingdom)
    - [Nagios](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/nagios)
    - [Keen IO](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/keen)
    - [Opsgenie](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/opsgenie)
    - [Beats](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/beats)
    - [Moogsoft](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/moogsoft)
    - [PagerDuty](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/pagerduty)
    - [Rollbar](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/rollbar)
    - [Raygun](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/raygun)
    - [Graphite](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/graphite)
    - [Grafana](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/grafana)
    - [APImetrics](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/apimetrics)
    - [Riemann](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/riemann)
    - [Atlas](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/atlas)
    - [Runscope](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/runscope)
    - [Dynatrace](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/dynatrace)
    - [Sensu](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/sensu)
    - [Pinpoint](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/pinpoint)
    - [Prometheus](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/prometheus)
    - [Vizceral](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/vizceral)
    - [Sentry](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/sentry)
    - [Google Analytics](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/google-analytics)
    - [Grok](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/grok)
    - [Zipkin](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/zipkin)
    - [Zabbix](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/zabbix)
    - [Datadog](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/datadog)
    - [Kibana](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/kibana)
    - [Elasticsearch](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/elasticsearch)
    - [Logstash](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/logstash)
    - [Airbrake](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/airbrake-io)
    - [New Relic](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/new-relic)
    - [App Dynamics](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/appdynamics)
    - [Vector](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/vector)
    - [Splunk](https://www.plutora.com/ci-cd-tools/bi-monitoring-logging-tools/splunk)
- Monolithic application: A **monolithic application** describes a single-tiered [software application](https://en.wikipedia.org/wiki/Application_software) in which the [user interface](https://en.wikipedia.org/wiki/User_interface) and data access code are combined into a single program from a single [platform](https://en.wikipedia.org/wiki/Platform_(computing)). A monolithic application is self-contained, and independent from other computing applications. The design philosophy is that the application is responsible not just for a particular task, but can perform every step needed to complete a particular function. In software engineering, a monolithic application describes a software application which is designed without modularity. Modularity is desirable, in general, as it supports reuse of parts of the application logic and also facilitates maintenance by allowing repair or replacement of parts of the application without requiring wholesale replacement.
- Loosely coupled application: In computing and systems design a loosely coupled system is one in which each of its components has, or makes use of, little or no knowledge of the definitions of other separate components. Subareas include the coupling of classes, interfaces, data, and services.
    
    Components in a loosely coupled system can be replaced with alternative implementations that provide the same services. Components in a loosely coupled system are less constrained to the same platform, language, operating system, or build environment.
    
    If systems are decoupled in time, it is difficult to also provide [transactional integrity](https://en.wikipedia.org/w/index.php?title=Transactional_integrity&action=edit&redlink=1); additional coordination protocols are required. [Data replication](https://en.wikipedia.org/wiki/Data_replication) across different systems provides loose coupling (in availability), but creates issues in maintaining [consistency](https://en.wikipedia.org/wiki/consistency.md) ([data synchronization](https://en.wikipedia.org/wiki/Data_synchronization)).
    
- Command line interpreter vs compiler: A compiler is a program that takes the source code of another program, written in a high level language, and translates all to machine code, which runs very efficiently. Normally, a compiler compiles files and a linker links all object filkes into an executable.
    
    [Compiled VS Interpreted](Solution%20Architect%20Questions/Compiled%20VS%20Interpreted.csv)
    
- Java compilation:
    
    This process is handled by the `JavaCompiler` class.
    
    1. All the source files specified on the command line are read, parsed into syntax trees, and then all externally visible definitions are entered into the compiler's symbol tables.
    2. All appropriate annotation processors are called. If any annotation processors generate any new source or class files, the compilation is restarted, until no new files are created.
    3. Finally, the syntax trees created by the parser are analyzed and translated into class files. During the course of the analysis, references to additional classes may be found. The compiler will check the source and class path for these classes; if they are found on the source path, those files will be compiled as well, although they will not be subject to annotation processing.
- JVM compatibility: A Java virtual machine (JVM) is a virtual machine that enables a computer to run Java programs as well as programs written in other languages that are also compiled to Java bytecode. The JVM is detailed by a specification that formally describes what is required in a JVM implementation. Having a specification ensures interoperability of Java programs across different implementations so that program authors using the Java Development Kit (JDK) need not worry about idiosyncrasies of the underlying hardware platform.
- function of stacks? (POP(), PUSH() , TOP()): In [computer science](https://en.wikipedia.org/wiki/Computer_science), a stack is an [abstract data type](https://en.wikipedia.org/wiki/Abstract_data_type) that serves as a [collection](https://en.wikipedia.org/wiki/Collection_(abstract_data_type)) of elements, with two principal operations:
    - **push**, which adds an element to the collection, and
    - **pop**, which removes the most recently added element that was not yet removed.
    
    The order in which elements come off a stack gives rise to its alternative name, **LIFO** (**last in, first out**). Additionally, a [peek](https://en.wikipedia.org/wiki/Peek_(data_type_operation)) operation may give access to the top without modifying the stack. Considered as a linear data structure, or more abstractly a sequential collection, the push and pop operations occur only at one end of the structure, referred to as the top of the stack. This data structure makes it possible to implement a stack as a singly linked list and a pointer to the top element.
    
- identify a circular linked list: A linked list is a linear data structure where each element is a separate object. Linked list elements are not stored at contiguous location; the elements are linked using pointers. Each node of a list is made up of two items - the data and a reference to the next node. The last node has a reference to null. A linked list is called circular if it is not NULL-terminated and all nodes are connected in the form of a cycle. An empty linked list is considered as circular. The idea is to store head of the linked list and traverse it. If we reach NULL, linked list is not circular. If we reach head again, list is circular
- bubble sort vs merge sort:
    
    **Bubble Sort** takes ****an iterative approach — looping through elements in a matrix-like fashion — to sorting, and is a great place to start with implementing your first sorting algorithm.
    
    Here’s how it works: given an unsorted array, for the full length of that array, we pass over each element; comparing it with the element next to it. If the first element is larger than the second, we swap the two elements.
    
    This creates a “bubbling” effect, where the smallest elements (in our case numbers) migrate their way to the front of the list with every pass.
    
    Merge Sort, on the other hand, takes a divide-and-conquer approach to sorting; recursively breaking the input array down until we have sorted tuple-sized subarrays that we can then merge back together at the end.
    
    Both have their pros and cons, but ultimately bubble sort quickly becomes less efficient when it comes to sorting larger data sets (or ‘big data’). Where as, Merge Sort becomes more efficient as data sets grow. Bubble sort is O(n2) and Merge Sort is O(nlogn). So, on a small set it wont be that different but on a lot of data Bubble sort will be much slower.
    
    The bubble sort wins in both situations because of the largest benefit of only having to run through it once. Merge sort can not cut any short cuts for only having to calculate the largest number. Merge takes the length of the list, finds the middle, and then all the numbers below the middle compare to the left and all above compare to the right; in oppose to creating unique pairs to compare. Meaning for every number left in the array an equal number of comparisons need to be made.
    
- Given n-million data elements, which would be the best,efficient, and faster sort method?: The most efficient sorting algorithm is the one that is tuned for your data, on your hardware, under your weird constraints. This answer is the same as it’s been for decades, and will always be the same.
    
    To really answer this question one has to first define what is meant by efficient. Are you counting:
    
    - Number of comparisons.
    - Number of data swaps.
    - Memory used.
    - Execution stack space used.
    
    “Optimal” can mean the best compromise between time and space, or it could be the least expensive in terms of time and money to write, or the best suited for general use or the best specifically for a problem.
    
    As per the standard **QUICK SORT** is the best sorting algorithm among all the comparison based sorting algorithm but it will give the worst case only when all the elements of an array is already sorted which is rarely happening.
    
    Which sorting algorithm is best and when:
    
    1.**INSERTION SORT**: when arrays most of the elements are sorted
    
    2. **QUICK SORT**: a).when arrays most of the elements are random
    
    b).small size array. The time complexity of Quicksort is O(n log n) in the best case, O(n log n) in the average case, and O(n^2) in the worst case. But because it has the best performance in the average case for most inputs, Quicksort is generally considered the “fastest” sorting algorithm.
    
    3.**MERGESORT**: a).when arrays no behavior is given
    
    b).big size array
    
    4.**COUNT SORT**: when in the set of n elements each element range is given
    
    5.**RADIX SORT**: when in the set of n elements every element contain the number of digits is given
    
    6.**SELECTION SORT**: when we required lesser swaps
    
- What is the average, best, and worst case performance? In computer science, best, worst, and average cases of a given algorithm express what the resource usage is at least, at most and on average, respectively. Usually the resource being considered is running time, i.e. time complexity, but could also be memory or other resource. Best case is the function which performs the minimum number of steps on input data of n elements. Worst case is the function which performs the maximum number of steps on input data of size n. Average case is the function which performs an average number of steps on input data of n elements.
- BIG-O Notation: Big O notation is a mathematical notation that describes the limiting behavior of a function when the argument tends towards a particular value or infinity. In computer science, big O notation is used to classify algorithms according to how their run time or space requirements grow as the input size grows. Big O notation characterizes functions according to their growth rates: different functions with the same growth rate may be represented using the same O notation. The letter O is used because the growth rate of a function is also referred to as the **order of the function**. A description of a function in terms of big O notation usually only provides an [upper bound](https://en.wikipedia.org/wiki/Upper_bound) on the growth rate of the function.

# Troubleshooting/MISC

- What would you do if a web application could not talk to the database?
- How to manage web application state between EC2 instances running in an auto scaling group?
- What kind of Metrics would you monitor for the E-commerce website application front-end?
- How do you use CIDR for Troubleshoot a webpage that can't access the DB
- Troubleshoot why you can't access a webpage server
- Explain how to scale from a single 5 user database to a 50 user, 500 user, 5000 user and then 5 million user database and explain how to overcome each hurdle.
- Which algorithm does an Elastic Load Balancer use?
- How do you architect a design that is fault tolerant?
- Whats a three tier web page architect,and how do you monitor to see a bottleneck and how do you improve it
- If you collected logs and wanted to store them for 14 days then move them over to permanent storage for a few years how would you do this
- What is a web application firewall and how do you use it, what layer is it on?
- How would you monitor utilization of equipment in a datacenter ?
- What else would you do for a high volume distributed app web site
- What would you do if a web application could not talk to the database?
- How to manage web application state between EC2 instances running in an auto scaling group?
- What kind of Metrics would you monitor for the E-commerce website application front-end?
- How do you use CIDR for Troubleshoot a webpage that can't access the DB
- Troubleshoot why you can't access a webpage server
- Explain how to scale from a single 5 user database to a 50 user, 500 user, 5000 user and then 5 million user database and explain how to overcome each hurdle.
- Which algorithm does an Elastic Load Balancer use?
- How do you architect a design that is fault tolerant?
- Whats a three tier web page architect,and how do you monitor to see a bottleneck and how do you improve it
- If you collected logs and wanted to store them for 14 days then move them over to permanent storage for a few years how would you do this
- What is a web application firewall and how do you use it, what layer is it on?
- How would you monitor utilization of equipment in a datacenter ?
- What else would you do for a high volume distributed app web site