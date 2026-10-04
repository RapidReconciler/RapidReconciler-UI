// BcryptHash -- print a password hash the running service will accept.
//
//   java -cp <spring-security-crypto.jar>;<spring-core.jar>;<logging.jar> BcryptHash.java <pw>
//
// <logging.jar> is spring-jcl on Spring 6 and commons-logging on Spring 7, and
// Spring Security 7 also needs spring-core (HK-38). persona-probe.py picks all
// three out of the VALC jar by name (CRYPTO_JARS) and its --self-test proves
// each one is required.
//
// Run as a single-file source program (JEP 330), so there is no compile step
// and no build artifact to go stale.
//
// WHY NOT A PYTHON BCRYPT LIBRARY. The point of a throwaway account is that the
// product's own login path accepts it. A third-party bcrypt would be a
// different implementation asserting the same thing, and a mismatch in cost
// factor or version prefix ($2a vs $2b) shows up as a 401 at login with
// nothing to say why. The encoder here is constructed exactly as
// SecurityConfig:442 does it -- `new BCryptPasswordEncoder()`, default strength,
// default version -- and the classpath is the crypto jar unpacked from the
// SHIPPED fat jar, not from the local Maven cache.
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class BcryptHash {
    public static void main(String[] args) {
        if (args.length < 1) {
            System.err.println("usage: BcryptHash <password>");
            System.exit(2);
        }
        BCryptPasswordEncoder enc = new BCryptPasswordEncoder();
        String hash = enc.encode(args[0]);
        // Self-check. A hash that will not verify against the encoder that made
        // it means the classpath is not the product's, and every probe that
        // used it would fail at login for a reason nothing would report.
        if (!enc.matches(args[0], hash)) {
            System.err.println("FATAL: encoder did not verify its own hash");
            System.exit(1);
        }
        System.out.println(hash);
    }
}
