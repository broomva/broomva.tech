# Week 1: Classical Computing


From 1981 onward, classical computers took off as a good enough tool for practical purposes. Now, classical computers are reaching a wall that quantum seems to be able to break.

# Number Bases

Decimal base uses numbers from 0 to 9 and can be expressed as:

$$
⁍
$$

Binary uses numbers from 0 to 1 and can be expressed as, and converted to decimal:

$$
⁍
$$

$$
⁍
$$

Briefly, any base number is determined by:

$$
base^a
$$

where the base can be, for example, binary:

$$
2^a
$$

or decimal:

$$
10^a
$$

and $a$ is the position of the digit.

### Example

- $2^0$ → 1
- $2^1$ → 2
- $2^3$ → 4
- $2^4$ → 16
- $2^5$ → 32
- $2^6$ → 64

Convert 33 to binary:

$$
33 = 32+1 \newline =2^5 + 2^0 \newline bin = 10001
$$

## Binary Addition

Whenever sums add to two or more, add a carry bit

$$
0+0 = 0 \newline 0+1=1 \newline 1+0 = 1 \newline 1+1=10
$$

# Boolean Logic

## Logic Gates

![Week%201%20Classical%20Computing/Screen_Shot_2020-10-18_at_14.25.13.png](Week%201%20Classical%20Computing/Screen_Shot_2020-10-18_at_14.25.13.png)

A NOT gate flips the bit: $a$ → $\bar a$

A FANOUT copies the bit: $a$ → $aa$

An AND gate outputs 1 if both inputs are 1, outputs 0 otherwise

An OR gate outputs 1 if either of the inputs is 1, outputs 0 if neither of the input bits is 1

A XOR gate outputs 1 if either input bits are 1, but no both, outputs 0 if neither or bot bits are 1

## Truth Tables

Tells us the output of a logical operation based on its inputs

![Week%201%20Classical%20Computing/Screen_Shot_2020-10-18_at_14.25.40.png](Week%201%20Classical%20Computing/Screen_Shot_2020-10-18_at_14.25.40.png)

# Universality

Any computaiton operation can be made by using a combination  of (NOT, AND, OR, FANOUT)

An Adder with gates:

![Week%201%20Classical%20Computing/Screen_Shot_2020-10-18_at_14.56.40.png](Week%201%20Classical%20Computing/Screen_Shot_2020-10-18_at_14.56.40.png)

# Reversability

Given the output of a gate, we can determine what the inputs are.

NOT is reversible, AND is not.

A reversible gate preserves all the information

A non-reversible gate loses some information.

> In quantum computing all gates need to be reversible. Loses of information destroy the computation
> 

# Fuctional Completness of NAND

We use Boolean logic gates to implement operations in computing. It turns out that with a specific set of logic gates, {NOT, OR, AND, XOR}, in combination with the COPY function, we can construct any possible operation on a set of bits. Because this can be done, this set of operations is called functionally complete.

The NAND gate comprises of an AND gate immediately followed by a NOT gate. Here is it’s circuit symbol and corresponding truth table:

![Week%201%20Classical%20Computing/Screen_Shot_2020-10-21_at_15.35.48.png](Week%201%20Classical%20Computing/Screen_Shot_2020-10-21_at_15.35.48.png)

A very interesting fact is that the NAND gate is functionally complete by itself. This means that any conceivable operation can be performed using only NAND gates and COPY.  We can create all of the other logic gates using only NAND and COPY.

![Week%201%20Classical%20Computing/Screen_Shot_2020-10-21_at_15.38.06.png](Week%201%20Classical%20Computing/Screen_Shot_2020-10-21_at_15.38.06.png)

![Week%201%20Classical%20Computing/Screen_Shot_2020-10-21_at_15.38.11.png](Week%201%20Classical%20Computing/Screen_Shot_2020-10-21_at_15.38.11.png)

![Week%201%20Classical%20Computing/Screen_Shot_2020-10-21_at_15.38.16.png](Week%201%20Classical%20Computing/Screen_Shot_2020-10-21_at_15.38.16.png)

![Week%201%20Classical%20Computing/Screen_Shot_2020-10-21_at_15.38.23.png](Week%201%20Classical%20Computing/Screen_Shot_2020-10-21_at_15.38.23.png)

The idea of functional completeness is extremely important in computing. If we want to make a computer, we must make physical circuits that perform these logical operations. If we have a functionally complete set of operations, {NAND} for example, we only need to know how to make that specific circuit, and then can make any operation necessary by combining the gates in different ways.
Once we delve deeper in quantum computing, we will see that there are parallels between classical logic gates and quantum gates. We will also learn what a functionally complete set of quantum gates